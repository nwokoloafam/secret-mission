// Loads a game's state from the database, runs one engine action on it, and
// saves everything the action produced, all inside one transaction. The game
// row is locked for the duration, so two people entering codes at the same
// moment can't corrupt the loop.

import type postgres from "postgres";
import { tick } from "../game/engine";
import {
  ActionResult,
  Ctx,
  DEFAULT_SETTINGS,
  GameError,
  Game,
  GameState,
  Mission,
  Player,
} from "../game/types";
import { db } from "./client";
import { planNotifications } from "../notification-plan";
import { insertNotifications } from "../notifications";

type Row = Record<string, unknown>;
type Tx = postgres.TransactionSql;

const d = (v: unknown) => (v ? new Date(v as string) : null);

export function rowToGame(r: Row): Game {
  return {
    id: r.id as string,
    name: r.name as string,
    status: r.status as Game["status"],
    startedAt: d(r.started_at),
    targetEndAt: d(r.target_end_at),
    pausedAt: d(r.paused_at),
    endedAt: d(r.ended_at),
    winnerId: (r.winner_id as string) ?? null,
    settings: { ...DEFAULT_SETTINGS, ...((r.settings as object) ?? {}) },
  };
}

export function rowToPlayer(r: Row): Player {
  return {
    id: r.id as string,
    firstName: r.first_name as string,
    howKnowAfam: (r.how_know_afam as string) ?? null,
    topColor: (r.top_color as string) ?? null,
    accessory: (r.accessory as string) ?? null,
    customHint: (r.custom_hint as string) ?? null,
    status: r.status as Player["status"],
    code: (r.code as string) ?? null,
    targetId: (r.target_id as string) ?? null,
    missionId: (r.mission_id as string) ?? null,
    missionsSeen: (r.missions_seen as string[]) ?? [],
    rerollsLeft: r.rerolls_left as number,
    accusationsUsed: r.accusations_used as number,
    bonusAccusationEarned: r.bonus_accusation_earned as boolean,
    killCount: r.kill_count as number,
    lastKillAt: d(r.last_kill_at),
    hintTierRevealed: r.hint_tier_revealed as number,
    graceUntil: d(r.grace_until),
    shieldUntil: d(r.shield_until),
    checkedInAt: d(r.checked_in_at),
    queuedAt: d(r.queued_at),
    outAt: d(r.out_at),
    outReason: (r.out_reason as Player["outReason"]) ?? null,
    outBy: (r.out_by as string) ?? null,
    betOnId: (r.bet_on_id as string) ?? null,
    poltergeistUsed: r.poltergeist_used as boolean,
  };
}

function rowToMission(r: Row): Mission {
  return { id: r.id as string, text: r.text as string, difficulty: r.difficulty as Mission["difficulty"], active: r.active as boolean };
}

async function loadState(tx: Tx | postgres.Sql, gameId: string, lock: boolean): Promise<GameState> {
  const games = lock
    ? await tx`select * from games where id = ${gameId} for update`
    : await tx`select * from games where id = ${gameId}`;
  if (games.length === 0) throw new Error("Game not found");
  // Keep the catalog fixed through allocation and saving its issued history.
  // Catalog edits take ROW EXCLUSIVE first and never lock game rows, so an
  // editor cannot slip between allocation and its ledger becoming visible.
  if (lock) await tx`lock table missions in share mode`;
  const players = await tx`select * from players where game_id = ${gameId} order by created_at`;
  const missions = await tx`select id, text, difficulty, active from missions`;
  return { game: rowToGame(games[0]), players: players.map(rowToPlayer), missions: missions.map(rowToMission) };
}

export async function getState(gameId: string): Promise<GameState> {
  return loadState(db(), gameId, false);
}

const iso = (v: Date | null) => (v ? v.toISOString() : null);

async function saveResult(tx: Tx, before: GameState, result: ActionResult) {
  const g = result.state.game;
  await tx`
    update games set
      status = ${g.status},
      started_at = ${iso(g.startedAt)},
      target_end_at = ${iso(g.targetEndAt)},
      paused_at = ${iso(g.pausedAt)},
      ended_at = ${iso(g.endedAt)},
      winner_id = ${g.winnerId},
      settings = ${tx.json(JSON.parse(JSON.stringify(g.settings)))}
    where id = ${g.id}`;

  const old = new Map(before.players.map((p) => [p.id, JSON.stringify(p)]));
  for (const p of result.state.players) {
    if (old.get(p.id) === JSON.stringify(p)) continue; // unchanged
    await tx`
      update players set
        status = ${p.status},
        code = ${p.code},
        target_id = ${p.targetId},
        mission_id = ${p.missionId},
        missions_seen = ${p.missionsSeen}::uuid[],
        rerolls_left = ${p.rerollsLeft},
        accusations_used = ${p.accusationsUsed},
        bonus_accusation_earned = ${p.bonusAccusationEarned},
        kill_count = ${p.killCount},
        last_kill_at = ${iso(p.lastKillAt)},
        hint_tier_revealed = ${p.hintTierRevealed},
        grace_until = ${iso(p.graceUntil)},
        shield_until = ${iso(p.shieldUntil)},
        checked_in_at = ${iso(p.checkedInAt)},
        queued_at = ${iso(p.queuedAt)},
        out_at = ${iso(p.outAt)},
        out_reason = ${p.outReason},
        out_by = ${p.outBy},
        bet_on_id = ${p.betOnId},
        poltergeist_used = ${p.poltergeistUsed}
      where id = ${p.id}`;
  }

  await insertNotifications(tx, g.id, planNotifications(before, result));

  for (const e of result.events) {
    await tx`
      insert into events (game_id, type, actor_id, subject_id, data)
      values (${g.id}, ${e.type}, ${e.actorId}, ${e.subjectId}, ${tx.json(JSON.parse(JSON.stringify(e.data)))})`;
  }
  for (const h of result.hints) {
    await tx`
      insert into hints (game_id, to_player_id, about_player_id, source, text)
      values (${g.id}, ${h.toPlayerId}, ${h.aboutPlayerId}, ${h.source}, ${h.text})`;
  }
}

/**
 * Safety limits for one game transaction (Postgres SET LOCAL, so they work
 * through Supabase's transaction pooler). If something holds the game lock or
 * a query stalls, we fail in seconds instead of hanging every page.
 */
async function limitTransaction(tx: Tx) {
  await tx`select set_config('lock_timeout', '5s', true),
                  set_config('statement_timeout', '10s', true),
                  set_config('idle_in_transaction_session_timeout', '15s', true)`;
}

function friendly(e: unknown): never {
  const code = (e as { code?: string })?.code;
  if (code === "55P03" || code === "57014") {
    throw new GameError("busy", "The game is busy right now. Try again in a moment.");
  }
  throw e;
}

function realCtx(): Ctx {
  return { now: new Date(), random: Math.random };
}

/**
 * Run an engine action against a game. Anything that's come due (end time,
 * late-join splices) is applied first, then the action itself.
 * A GameError from the action rolls everything back and is re-thrown.
 */
export async function runAction(
  gameId: string,
  action: (state: GameState, ctx: Ctx) => ActionResult,
): Promise<ActionResult> {
  return (db().begin(async (tx) => {
    await limitTransaction(tx);
    const ctx = realCtx();
    const loaded = await loadState(tx, gameId, true);

    const ticked = tick(loaded, ctx);
    if (ticked) await saveResult(tx, loaded, ticked);
    const current = ticked?.state ?? loaded;

    const result = action(current, ctx);
    await saveResult(tx, current, result);
    return result;
  }) as Promise<ActionResult>).catch(friendly);
}

/** Apply anything that's come due. Called every ~30s by the admin page. */
export async function runTick(gameId: string): Promise<ActionResult | null> {
  // Cheap check without taking the game lock: most ticks have nothing to do.
  const peek = await loadState(db(), gameId, false);
  if (!tick(peek, realCtx())) return null;

  return db().begin(async (tx) => {
    await limitTransaction(tx);
    const loaded = await loadState(tx, gameId, true);
    const ticked = tick(loaded, realCtx());
    if (ticked) await saveResult(tx, loaded, ticked);
    return ticked;
  }) as Promise<ActionResult | null>;
}
