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

import { getState, runAction } from "./db/games";
import { startGame, removePlayer, endGame, resetGame, reroll, pauseGame } from "./game/engine";
import { missionCapacity } from "./game/mission-pool";
import { hostBroadcast, hostDeletePlayer, hostEditMission, hostStart } from "@/app/actions";
import { missionText } from "./db/queries";
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
    await holder.sql`insert into missions(text) select 'task ' || n from generate_series(1, 12) n`;
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

  it("requires fresh host acknowledgment before starting a short-pool game in duplicate mode", async () => {
    await holder.sql`delete from missions where text not in ('task 1','task 2','task 3')`;
    expect((await hostStart("bad-admin", 150)).ok).toBe(false);
    expect((await hostStart("admin", 150)).ok).toBe(false);
    expect((await getState(game)).game.status).toBe("setup");
    expect(await holder.sql`select id from events where game_id=${game}`).toHaveLength(0);
    expect(await holder.sql`select id from player_notifications where game_id=${game}`).toHaveLength(0);

    const stale = missionCapacity(await getState(game)).acknowledgment;
    await holder.sql`insert into players(game_id,token,first_name,status) values (${game},'late-checkin','Late','checked_in')`;
    expect((await hostStart("admin", 150, stale)).ok).toBe(false);
    const current = missionCapacity(await getState(game)).acknowledgment;
    expect((await hostStart("admin", 150, current)).ok).toBe(true);
    const started = await getState(game);
    expect(started.game.settings.missionMode).toBe("duplicate");
    expect(started.game.status).toBe("active");
    expect(started.players).toHaveLength(5);
    expect(new Set(started.players.map(p => p.missionId)).size).toBeLessThan(5);
    expect(started.players.every(p => p.missionsSeen.length === 1)).toBe(true);
  });

  it("serializes simultaneous assignments and persists the round's no-repeat history", async () => {
    expect((await hostStart("admin", 150)).ok).toBe(true);
    await Promise.all(ids.slice(0, 2).map(id => runAction(game, (s, c) => reroll(s, c, id))));
    const saved = await getState(game);
    expect(saved.game.settings.missionMode).toBe("unique");
    const issued = saved.players.flatMap(p => p.missionsSeen);
    expect(issued).toHaveLength(6);
    expect(new Set(issued).size).toBe(6);
    expect(new Set(saved.game.settings.usedMissionIds)).toEqual(new Set(issued));
    await runAction(game, endGame);
    await runAction(game, resetGame);
    const reset = await getState(game);
    expect(reset.game.settings.usedMissionIds).toEqual([]);
    expect(reset.game.settings.usedMissionTexts).toEqual([]);
    expect(reset.game.settings.playerMissionTexts).toEqual({});
    expect(reset.players.every(p => p.missionsSeen.length === 0)).toBe(true);
  });

  it("preserves a removed legacy player's used tasks when the host deletes their row", async () => {
    await runAction(game, startGame);
    const before = await getState(game);
    const spent = before.players.find(p => p.id === ids[0])!.missionsSeen;
    await runAction(game, (s, c) => removePlayer(s, c, ids[0], "left"));
    // Simulate a running game that predates the new game-level ledger.
    await holder.sql`update games set settings = settings - 'usedMissionIds' - 'usedMissionTexts' - 'playerMissionTexts' where id=${game}`;
    expect((await hostDeletePlayer("admin", ids[0])).ok).toBe(true);
    const saved = await getState(game);
    expect(saved.players.some(p => p.id === ids[0])).toBe(false);
    expect(saved.game.settings.usedMissionIds).toEqual(expect.arrayContaining(spent));
    expect(saved.game.settings.usedMissionTexts).toEqual(expect.arrayContaining(
      before.missions.filter(m => spent.includes(m.id)).map(m => m.text.toLowerCase())));
  });

  it("protects issued task text in every running game, including while paused", async () => {
    await runAction(game, startGame);
    const state = await getState(game);
    const mission = state.missions.find(m => m.id === state.players[0].missionId)!;
    const other = state.missions.find(m => m.id === state.players[1].missionId)!;
    // A different host can edit the shared catalog, but cannot change an
    // issued task into a normalized duplicate of somebody else's task.
    const rejected = await hostEditMission("other", mission.id, other.text.toUpperCase(), "M");
    expect(rejected.ok).toBe(false);
    expect(rejected).toMatchObject({ error: expect.stringContaining("Add a new task") });
    expect(await missionText(mission.id)).toBe(mission.text);
    // Cosmetic corrections do not change which task the player receives.
    expect((await hostEditMission("other", mission.id, mission.text.toUpperCase().replace(" ", "   "), "M")).ok).toBe(true);
    expect(await missionText(mission.id)).toBe(mission.text.toUpperCase().replace(" ", "   "));
    await runAction(game, pauseGame);
    expect((await hostEditMission("admin", mission.id, "A changed task while paused", "E")).ok).toBe(false);
  });

  it("protects legacy and permanently deleted players' issued tasks from edits", async () => {
    await runAction(game, startGame);
    const state = await getState(game);
    const mission = state.missions.find(m => m.id === state.players.find(p => p.id === ids[0])!.missionId)!;
    // Current task IDs protect a pre-ledger round even without missions_seen.
    await holder.sql`update games set settings = settings - 'usedMissionIds' - 'usedMissionTexts' - 'playerMissionTexts' where id=${game}`;
    await holder.sql`update players set missions_seen = '{}'::uuid[] where id=${ids[0]}`;
    expect((await hostEditMission("admin", mission.id, "Changed current legacy task", "E")).ok).toBe(false);
    await runAction(game, (s, c) => removePlayer(s, c, ids[0], "left"));
    // After leaving, only the legacy player's missions_seen carries the ID.
    await holder.sql`update games set settings = settings - 'usedMissionIds' - 'usedMissionTexts' - 'playerMissionTexts' where id=${game}`;
    expect((await hostEditMission("admin", mission.id, "Changed retired legacy task", "E")).ok).toBe(false);
    expect((await hostDeletePlayer("admin", ids[0])).ok).toBe(true);
    expect((await hostEditMission("admin", mission.id, "Changed deleted player's task", "E")).ok).toBe(false);
    expect(await missionText(mission.id)).toBe(mission.text);
  });

  it("allows unissued task edits and issued task edits once the round ends", async () => {
    await runAction(game, startGame);
    const state = await getState(game);
    const unissued = state.missions.find(m => !state.game.settings.usedMissionIds.includes(m.id))!;
    expect((await hostEditMission("admin", unissued.id, "A new unused task", "E")).ok).toBe(true);
    expect(await missionText(unissued.id)).toBe("A new unused task");
    const issued = state.players[0].missionId!;
    await runAction(game, endGame);
    expect((await hostEditMission("admin", issued, "Updated after the round", "E")).ok).toBe(true);
    expect(await missionText(issued)).toBe("Updated after the round");
  });

  it("waits for in-flight allocations before checking whether task text can change", async () => {
    await runAction(game, startGame);
    const state = await getState(game);
    const mission = state.missions.find(m => !state.game.settings.usedMissionIds.includes(m.id))!;
    const observer = postgres(url!, { max: 1, prepare: false });
    let edit: ReturnType<typeof hostEditMission> | undefined;
    try {
      await holder.sql.begin(async (tx) => {
        await tx`lock table missions in share mode`;
        await tx`update games set settings = settings || ${tx.json({ usedMissionIds: [...state.game.settings.usedMissionIds, mission.id] })} where id=${game}`;
        edit = hostEditMission("admin", mission.id, "An edit racing allocation", "E");
        // Observe the editor waiting on the catalog lock, without timing the
        // test around an assumed query speed or committing history early.
        let waiting = false;
        const deadline = Date.now() + 3000;
        while (!waiting && Date.now() < deadline) {
          const [lock] = await observer`select exists (
            select 1 from pg_locks where relation = 'missions'::regclass
            and mode = 'RowExclusiveLock' and not granted
          ) as waiting`;
          waiting = lock.waiting as boolean;
          if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
      });
      expect((await edit!).ok).toBe(false);
      expect(await missionText(mission.id)).toBe(mission.text);
    } finally {
      if (edit) await edit;
      await observer.end();
    }
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
