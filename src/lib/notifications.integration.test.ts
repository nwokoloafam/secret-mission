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
vi.mock("@/lib/email/background", () => ({ scheduleEmailDispatch: vi.fn() }));

import { runAction } from "./db/games";
import { startGame, removePlayer, endGame, resetGame } from "./game/engine";
import { hostBroadcast } from "@/app/actions";
import { markNotificationsRead, updateEmailPreferences } from "@/app/notification-actions";
import { inboxForPlayer } from "./notifications";

const url = process.env.CORE_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("notifications database integration", () => {
  let game: string, otherGame: string, ids: string[];
  beforeAll(async () => {
    const u = new URL(url!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || u.pathname !== '/secret_mission_notifications_coretest') throw new Error('Refusing to reset a non-test database');
    holder.sql = postgres(url!, { max: 2, prepare: false });
    await holder.sql.unsafe('drop schema if exists public cascade; create schema public; create schema if not exists storage; create table if not exists storage.buckets (id text primary key, name text, public boolean)');
    for (const file of ['0001_init.sql', '0003_notifications.sql']) await holder.sql.unsafe(await readFile(`supabase/migrations/${file}`, 'utf8'));
    // The inbox migration alone must not introduce optional email storage.
    const columns = await holder.sql`select column_name from information_schema.columns where table_schema='public' and table_name='players' and column_name like 'email%'`;
    expect(columns).toHaveLength(0);
    const [priorGame] = await holder.sql`insert into games(name,admin_token) values ('Before email','before-email') returning id`;
    const [priorPlayer] = await holder.sql`insert into players(game_id,token,first_name) values (${priorGame.id},'before-email','Existing player') returning id`;
    await holder.sql`insert into player_notifications(game_id,player_id,kind,message) values (${priorGame.id},${priorPlayer.id},'personal_link','Existing update')`;
    await holder.sql.unsafe(await readFile('supabase/migrations/0004_email_notifications.sql', 'utf8'));
    const [preserved] = await holder.sql`select first_name,email,email_opt_in,email_consent_at from players where id=${priorPlayer.id}`;
    expect(preserved).toEqual({ first_name: 'Existing player', email: null, email_opt_in: false, email_consent_at: null });
    expect(await holder.sql`select id from player_notifications where player_id=${priorPlayer.id}`).toHaveLength(1);
    process.env.NOTIFICATIONS_ENABLED = 'true'; process.env.EMAIL_MODE = 'dry-run';
  });
  afterAll(async () => { if (holder.sql) await holder.sql.end(); });
  beforeEach(async () => {
    await holder.sql.unsafe('truncate email_outbox, player_notifications, events, hints, disputes, players, games, missions cascade');
    await holder.sql`insert into missions(text) values ('task one'), ('task two'), ('task three')`;
    const [g] = await holder.sql`insert into games(name,admin_token) values ('test','admin') returning id`; game = g.id;
    const [g2] = await holder.sql`insert into games(name,admin_token) values ('other','other') returning id`; otherGame = g2.id;
    ids = [];
    for (let i=0;i<4;i++) {
      const [p] = await holder.sql`insert into players(game_id,token,first_name,status,email,email_opt_in) values (${game}, ${'token'+i}, ${'player'+i}, 'checked_in', ${'p'+i+'@example.com'}, ${i !== 1}) returning id`;
      ids.push(p.id);
    }
    await holder.sql`insert into players(game_id,token,first_name,status,email,email_opt_in) values (${otherGame}, 'other-player', 'other', 'checked_in','other@example.com',true)`;
  });
  it('saves start and removal notices atomically and respects opt-out', async () => {
    await runAction(game, startGame);
    const notices = await holder.sql`select player_id, kind from player_notifications where game_id=${game}`;
    expect(notices).toHaveLength(4); expect(notices.every(n => n.kind === 'game_started')).toBe(true);
    const outbox = await holder.sql`select player_id, delivery_mode from email_outbox`; expect(outbox).toHaveLength(3);
    expect(outbox.every(r => r.delivery_mode === "dry-run")).toBe(true);
    expect(outbox.some(r => r.player_id === ids[1])).toBe(false);
    const [victim] = await holder.sql`select id from players where id=${ids[0]}`;
    const [hunter] = await holder.sql`select id from players where target_id=${victim.id}`;
    await runAction(game, (s,c) => removePlayer(s,c,victim.id,'left'));
    const changed = await holder.sql`select player_id from player_notifications where kind='new_target'`;
    expect(changed.map(x=>x.player_id)).toEqual([hunter.id]);
  });
  it('broadcasts only to the game and enqueues for consenting players', async () => {
    expect((await hostBroadcast('admin','Party update')).ok).toBe(true);
    const inbox = await holder.sql`select player_id, message from player_notifications`;
    expect(inbox).toHaveLength(4); expect(inbox.every(n=>ids.includes(n.player_id) && n.message === 'Party update')).toBe(true);
    expect(await holder.sql`select id from email_outbox`).toHaveLength(3);
  });
  it('updates consent idempotently, suppresses old pending mail and queues changed addresses', async () => {
    expect((await updateEmailPreferences('token1','first@example.com',true)).ok).toBe(true);
    await updateEmailPreferences('token1','first@example.com',true);
    expect(await holder.sql`select id from email_outbox where player_id=${ids[1]}`).toHaveLength(1);
    await updateEmailPreferences('token1','second@example.com',true);
    let rows = await holder.sql`select email,status from email_outbox where player_id=${ids[1]} order by created_at`;
    expect(rows.map(r=>r.status)).toEqual(['suppressed','pending']);
    expect(rows[1].email).toBe('second@example.com');
    process.env.EMAIL_MODE='off';
    expect((await updateEmailPreferences('token1','',false)).ok).toBe(true);
    process.env.EMAIL_MODE='dry-run';
    rows = await holder.sql`select status from email_outbox where player_id=${ids[1]}`;
    expect(rows.every(r=>r.status==='suppressed')).toBe(true);
  });
  it('marks only the authenticated player’s displayed notices up to the cutoff', async () => {
    await hostBroadcast('admin','first');
    const first = (await inboxForPlayer(ids[0]))[0];
    await holder.sql`insert into player_notifications(game_id,player_id,kind,message,created_at) values (${game},${ids[0]},'test','later',${new Date(Date.parse(first.createdAt)+1000).toISOString()})`;
    expect((await markNotificationsRead('bad-token', first.createdAt)).ok).toBe(false);
    expect((await markNotificationsRead('token0', first.createdAt)).ok).toBe(true);
    const own = await inboxForPlayer(ids[0]); expect(own.find(x=>x.message==='first')?.readAt).toBeTruthy(); expect(own.find(x=>x.message==='later')?.readAt).toBeNull();
    expect((await inboxForPlayer(ids[1]))[0].readAt).toBeNull();
  });
  it('rolls back state, events, inbox and outbox if a notification insert fails', async () => {
    await holder.sql`alter table player_notifications add constraint fail_test check (kind <> 'game_started')`;
    try { await expect(runAction(game,startGame)).rejects.toThrow(); }
    finally { await holder.sql`alter table player_notifications drop constraint fail_test`; }
    const [g] = await holder.sql`select status from games where id=${game}`;
    expect(g.status).toBe('setup'); expect(await holder.sql`select id from events`).toHaveLength(0);
    expect(await holder.sql`select id from player_notifications`).toHaveLength(0); expect(await holder.sql`select id from email_outbox`).toHaveLength(0);
  });
  it('suppresses only pending mail from the previous round and preserves inbox history', async () => {
    await runAction(game, startGame);
    await runAction(game, endGame);
    await hostBroadcast('other', 'other game');
    const history = await holder.sql`select id from player_notifications where game_id=${game}`;
    const other = await holder.sql`select id from email_outbox where status='pending' and player_id not in ${holder.sql(ids)}`;
    expect(other.length).toBeGreaterThan(0);
    await runAction(game, resetGame);
    const old = await holder.sql`select status,error_code from email_outbox where notification_id in ${holder.sql(history.map(x => x.id))}`;
    expect(old.length).toBeGreaterThan(0);
    expect(old.every(x => x.status === 'suppressed' && x.error_code === 'round_restarted')).toBe(true);
    const retained = await holder.sql`select id from player_notifications where id in ${holder.sql(history.map(x => x.id))}`;
    expect(retained).toHaveLength(history.length);
    const reset = await holder.sql`select player_id from player_notifications where game_id=${game} and kind='round_reset'`;
    expect(reset).toHaveLength(4);
    expect(await holder.sql`select id from email_outbox where notification_id in (select id from player_notifications where kind='round_reset')`).toHaveLength(0);
    expect(await holder.sql`select id from email_outbox where id in ${holder.sql(other.map(x => x.id))} and status='pending'`).toHaveLength(other.length);
  });
  it('batches a 30-person broadcast while preserving consent and game isolation', async () => {
    for (let i = 4; i < 30; i++) {
      await holder.sql`insert into players(game_id,token,first_name,status,email,email_opt_in)
        values (${game}, ${'bulk'+i}, ${'guest'+i}, 'checked_in', ${'bulk'+i+'@example.com'}, ${i % 2 === 0})`;
    }
    expect((await hostBroadcast('admin', 'Thirty-person update')).ok).toBe(true);
    expect(await holder.sql`select id from player_notifications where game_id=${game} and kind='announcement'`).toHaveLength(30);
    const queued = await holder.sql`select o.player_id from email_outbox o join players p on p.id=o.player_id where p.game_id=${game}`;
    expect(queued).toHaveLength(16);
    expect(await holder.sql`select id from player_notifications where game_id=${otherGame}`).toHaveLength(0);
  });
  it('runs the old schema with notifications disabled', async () => {
    process.env.NOTIFICATIONS_ENABLED = 'false';
    await holder.sql`drop table email_outbox, player_notifications, email_dispatch_control`;
    await holder.sql`alter table players drop column email, drop column email_opt_in, drop column email_consent_at`;
    try {
      await runAction(game, startGame);
      const [g] = await holder.sql`select status from games where id=${game}`;
      expect(g.status).toBe('active');
      expect(await inboxForPlayer(ids[0])).toEqual([]);
    } finally { process.env.NOTIFICATIONS_ENABLED = 'true'; }
  });

});
