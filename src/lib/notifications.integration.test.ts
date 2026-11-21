import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { readFile } from "node:fs/promises";

const holder = vi.hoisted(() => ({ sql: null as unknown as ReturnType<typeof import("postgres").default> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: () => holder.sql }));
vi.mock("./db/client", () => ({ db: () => holder.sql }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/photos", () => ({ uploadPhoto: vi.fn() }));

import { runAction } from "./db/games";
import { startGame, removePlayer, endGame, resetGame } from "./game/engine";
import { hostBroadcast } from "@/app/actions";
import { markNotificationsRead } from "@/app/notification-actions";
import { inboxForPlayer } from "./notifications";

const url = process.env.CORE_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("notifications database integration", () => {
  let game: string, otherGame: string, ids: string[];
  beforeAll(async () => {
    const u = new URL(url!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || u.pathname !== "/secret_mission_notifications_coretest") {
      throw new Error("Refusing to reset a non-test database");
    }
    holder.sql = postgres(url!, { max: 2, prepare: false });
    await holder.sql.unsafe("drop schema if exists public cascade; create schema public; create schema if not exists storage; create table if not exists storage.buckets (id text primary key, name text, public boolean)");
    for (const file of ["0001_init.sql", "0003_notifications.sql"]) {
      await holder.sql.unsafe(await readFile(`supabase/migrations/${file}`, "utf8"));
    }
    process.env.NOTIFICATIONS_ENABLED = "true";
  });
  afterAll(async () => { if (holder.sql) await holder.sql.end(); });
  beforeEach(async () => {
    await holder.sql.unsafe("truncate player_notifications, events, hints, disputes, players, games, missions cascade");
    await holder.sql`insert into missions(text) values ('task one'), ('task two'), ('task three')`;
    const [g] = await holder.sql`insert into games(name,admin_token) values ('test','admin') returning id`;
    game = g.id;
    const [g2] = await holder.sql`insert into games(name,admin_token) values ('other','other') returning id`;
    otherGame = g2.id;
    ids = [];
    for (let i = 0; i < 4; i++) {
      const [p] = await holder.sql`insert into players(game_id,token,first_name,status)
        values (${game}, ${"token" + i}, ${"player" + i}, 'checked_in') returning id`;
      ids.push(p.id);
    }
    await holder.sql`insert into players(game_id,token,first_name,status)
      values (${otherGame}, 'other-player', 'other', 'checked_in')`;
  });

  it("installs the inbox independently of email storage", async () => {
    const columns = await holder.sql`select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'players'
      and column_name in ('email', 'email_opt_in', 'email_consent_at')`;
    const [tables] = await holder.sql`select to_regclass('public.player_notifications') as inbox,
      to_regclass('public.email_outbox') as outbox, to_regclass('public.email_dispatch_control') as dispatch`;
    expect(columns).toHaveLength(0);
    expect(tables.inbox).toBe("player_notifications");
    expect(tables.outbox).toBeNull();
    expect(tables.dispatch).toBeNull();
  });

  it("saves start notices for everyone and removal updates only for the affected hunter", async () => {
    await runAction(game, startGame);
    const notices = await holder.sql`select player_id, kind from player_notifications where game_id=${game}`;
    expect(notices).toHaveLength(4);
    expect(notices.every(n => n.kind === "game_started" && ids.includes(n.player_id))).toBe(true);
    expect(await holder.sql`select id from player_notifications where game_id=${otherGame}`).toHaveLength(0);
    const [hunter] = await holder.sql`select id from players where target_id=${ids[0]}`;
    await runAction(game, (s, c) => removePlayer(s, c, ids[0], "left"));
    const changed = await holder.sql`select player_id from player_notifications where kind='new_target'`;
    expect(changed.map(x => x.player_id)).toEqual([hunter.id]);
  });

  it("broadcasts only to players in the host's game", async () => {
    expect((await hostBroadcast("admin", "Party update")).ok).toBe(true);
    const inbox = await holder.sql`select player_id, message from player_notifications`;
    expect(inbox).toHaveLength(4);
    expect(inbox.every(n => ids.includes(n.player_id) && n.message === "Party update")).toBe(true);
  });

  it("marks only the authenticated player's displayed notices up to the cutoff", async () => {
    await hostBroadcast("admin", "first");
    const first = (await inboxForPlayer(ids[0]))[0];
    await holder.sql`insert into player_notifications(game_id,player_id,kind,message,created_at)
      values (${game},${ids[0]},'test','later',${new Date(Date.parse(first.createdAt) + 1000).toISOString()})`;
    expect((await markNotificationsRead("bad-token", first.createdAt)).ok).toBe(false);
    expect((await markNotificationsRead("token0", first.createdAt)).ok).toBe(true);
    const own = await inboxForPlayer(ids[0]);
    expect(own.find(x => x.message === "first")?.readAt).toBeTruthy();
    expect(own.find(x => x.message === "later")?.readAt).toBeNull();
    expect((await inboxForPlayer(ids[1]))[0].readAt).toBeNull();
  });

  it("rolls back state, events, and inbox if a notification insert fails", async () => {
    await holder.sql`alter table player_notifications add constraint fail_test check (kind <> 'game_started')`;
    try { await expect(runAction(game, startGame)).rejects.toThrow(); }
    finally { await holder.sql`alter table player_notifications drop constraint fail_test`; }
    const [g] = await holder.sql`select status from games where id=${game}`;
    expect(g.status).toBe("setup");
    expect(await holder.sql`select id from events`).toHaveLength(0);
    expect(await holder.sql`select id from player_notifications`).toHaveLength(0);
  });

  it("preserves inbox history on reset and adds reset notices only to that game", async () => {
    await runAction(game, startGame);
    await runAction(game, endGame);
    await hostBroadcast("other", "other game");
    const history = await holder.sql`select id from player_notifications where game_id=${game}`;
    const other = await holder.sql`select id, kind, message from player_notifications where game_id=${otherGame}`;
    expect(history.length).toBeGreaterThan(0);
    expect(other).toHaveLength(1);
    await runAction(game, resetGame);
    const retained = await holder.sql`select id from player_notifications where id in ${holder.sql(history.map(x => x.id))}`;
    expect(retained).toHaveLength(history.length);
    const reset = await holder.sql`select player_id from player_notifications where game_id=${game} and kind='round_reset'`;
    expect(reset).toHaveLength(4);
    expect(reset.every(n => ids.includes(n.player_id))).toBe(true);
    expect(await holder.sql`select id, kind, message from player_notifications where game_id=${otherGame}`).toEqual(other);
  });

  it("batches a 30-person broadcast while preserving game isolation", async () => {
    for (let i = 4; i < 30; i++) {
      await holder.sql`insert into players(game_id,token,first_name,status)
        values (${game}, ${"bulk" + i}, ${"guest" + i}, 'checked_in')`;
    }
    expect((await hostBroadcast("admin", "Thirty-person update")).ok).toBe(true);
    expect(await holder.sql`select id from player_notifications where game_id=${game} and kind='announcement'`).toHaveLength(30);
    expect(await holder.sql`select id from player_notifications where game_id=${otherGame}`).toHaveLength(0);
  });

  it("runs the old schema with notifications disabled", async () => {
    process.env.NOTIFICATIONS_ENABLED = "false";
    await holder.sql`drop table player_notifications`;
    try {
      await runAction(game, startGame);
      const [g] = await holder.sql`select status from games where id=${game}`;
      expect(g.status).toBe("active");
      expect(await inboxForPlayer(ids[0])).toEqual([]);
    } finally {
      await holder.sql.unsafe(await readFile("supabase/migrations/0003_notifications.sql", "utf8"));
      process.env.NOTIFICATIONS_ENABLED = "true";
    }
  });
});
