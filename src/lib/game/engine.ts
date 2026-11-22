// The game engine: every game action as a pure function.
//
// Each action takes the current state, returns the new state plus the events,
// hints and notifications it produced, and never touches the database.
// The database layer (src/lib/db) loads state, calls one action, and saves the
// result in a single transaction.
//
// Rules reference: background-info/design/game-logic.md

import {
  ActionResult,
  Ctx,
  GameError,
  GameEvent,
  GameState,
  Mission,
  NewHint,
  Notification,
  NotificationKind,
  OutReason,
  Player,
} from "./types";
import { distinctMissions, missionCapacity, normalizeMissionText, recordExistingMissionHistory } from "./mission-pool";
export { getMissionCapacity, missionCapacity } from "./mission-pool";
export type { MissionCapacity } from "./mission-pool";

// ─────────────────────────────────────────────
// Draft: a working copy of the state plus everything the action produced
// ─────────────────────────────────────────────

class Draft {
  state: GameState;
  events: GameEvent[] = [];
  hints: NewHint[] = [];
  notifications: Notification[] = [];

  constructor(
    state: GameState,
    public ctx: Ctx,
  ) {
    this.state = structuredClone(state);
    recordExistingMissionHistory(this.state);
  }

  get game() {
    return this.state.game;
  }
  get now() {
    return this.ctx.now;
  }
  get settings() {
    return this.state.game.settings;
  }

  player(id: string): Player {
    const p = this.state.players.find((x) => x.id === id);
    if (!p) throw new GameError("no_player", "That player doesn't exist.");
    return p;
  }

  alive(): Player[] {
    return this.state.players.filter((p) => p.status === "alive");
  }

  queued(): Player[] {
    return this.state.players
      .filter((p) => p.status === "queued")
      .sort((a, b) => (a.queuedAt?.getTime() ?? 0) - (b.queuedAt?.getTime() ?? 0));
  }

  hunterOf(id: string): Player {
    const h = this.alive().find((p) => p.targetId === id);
    if (!h) throw new GameError("broken_loop", "Couldn't find who is hunting this player.");
    return h;
  }

  event(type: string, actorId: string | null, subjectId: string | null, data: Record<string, unknown> = {}) {
    this.events.push({ type, actorId, subjectId, data });
  }

  notify(playerId: string | null, kind: NotificationKind) {
    this.notifications.push({ playerId, kind });
  }

  pick<T>(items: T[]): T {
    return items[Math.floor(this.ctx.random() * items.length)];
  }

  result(): ActionResult {
    return { state: this.state, events: this.events, hints: this.hints, notifications: this.notifications };
  }

  // ── missions ──

  /** Give a player a fresh mission they haven't had, and notify them. */
  assignMission(p: Player) {
    const allowHard = this.alive().length <= this.settings.hardMissionsAtAlive;
    const pool = this.state.missions.filter((m) => m.active && (allowHard || m.difficulty !== "H"));
    const personalTexts = new Set(this.settings.playerMissionTexts[p.id] ?? []);
    const personalFresh = distinctMissions(pool.filter((m) =>
      !p.missionsSeen.includes(m.id) && m.id !== p.missionId && !personalTexts.has(normalizeMissionText(m.text)),
    ));
    const usedIds = new Set(this.settings.usedMissionIds);
    const usedTexts = new Set(this.settings.usedMissionTexts);
    const globallyFresh = personalFresh.filter((m) => !usedIds.has(m.id) && !usedTexts.has(normalizeMissionText(m.text)));
    const fresh = globallyFresh.length || this.settings.missionMode === "unique" ? globallyFresh : personalFresh;
    if (fresh.length === 0) {
      throw new GameError("no_fresh_missions", `No new eligible task is available. Ask the host to add or activate a new task${allowHard ? "" : " at easy or medium difficulty"}. This action has not been applied.`);
    }
    const m: Mission = this.pick(fresh);
    p.missionId = m.id;
    if (!p.missionsSeen.includes(m.id)) p.missionsSeen.push(m.id);
    if (!usedIds.has(m.id)) this.settings.usedMissionIds.push(m.id);
    const text = normalizeMissionText(m.text);
    if (!usedTexts.has(text)) this.settings.usedMissionTexts.push(text);
    personalTexts.add(text);
    this.settings.playerMissionTexts[p.id] = [...personalTexts];
  }

  /** A player's target changed: new mission + notification. */
  newTarget(p: Player) {
    this.assignMission(p);
    this.notify(p.id, "new_target");
  }

  // ── codes ──

  uniqueCode(): string {
    const used = new Set(this.state.players.map((p) => p.code).filter(Boolean));
    for (let i = 0; i < 1000; i++) {
      const code = String(Math.floor(this.ctx.random() * 10000)).padStart(4, "0");
      if (!used.has(code)) return code;
    }
    throw new GameError("no_codes", "Couldn't generate a unique code.");
  }

  // ── loop operations ──

  /** Make p alive and give them what they need to play. */
  enterLoop(p: Player, withGrace: boolean) {
    p.status = "alive";
    p.code = p.code ?? this.uniqueCode();
    p.queuedAt = null;
    if (withGrace) p.graceUntil = new Date(this.now.getTime() + this.settings.graceMinutes * 60_000);
    this.assignMission(p);
    this.notify(p.id, "new_target");
  }

  /** Insert p right after hunter: hunter → p → hunter's old target. */
  spliceAfter(hunter: Player, p: Player) {
    p.targetId = hunter.targetId === hunter.id ? hunter.id : hunter.targetId;
    hunter.targetId = p.id;
  }

  /** Take x out of the loop; x's hunter inherits x's target. Returns the hunter (or null if x was alone). */
  unlink(x: Player): Player | null {
    if (x.targetId === x.id || x.targetId === null) {
      x.targetId = null;
      return null;
    }
    const h = this.hunterOf(x.id);
    h.targetId = x.targetId === h.id ? h.id : x.targetId;
    x.targetId = null;
    return h;
  }

  /** Mark x out of the game and close the loop around them. */
  takeOut(x: Player, reason: OutReason, by: string | null): Player | null {
    const h = this.unlink(x);
    x.status = reason === "kill" || reason === "accusation" ? "eliminated" : "left";
    x.outAt = this.now;
    x.outReason = reason;
    x.outBy = by;
    x.missionId = null;
    x.graceUntil = null;
    x.shieldUntil = null;
    return h;
  }

  creditKill(killer: Player) {
    killer.killCount += 1;
    killer.lastKillAt = this.now;
  }

  /** After a kill, splice the first queued player in: killer → newcomer → killer's new target. */
  spliceQueuedAfterKill(killer: Player) {
    const next = this.queued()[0];
    if (!next) return;
    this.spliceAfter(killer, next);
    this.enterLoop(next, true);
    if (!killer.missionId) this.newTarget(killer); // killer was alone, had no mission
    this.event("splice", null, next.id, { after: killer.id, via: "kill" });
  }

  /** End the game if one or no players are left. */
  endIfOver() {
    if (this.alive().length <= 1 && this.queued().length === 0) this.finish("last_standing");
  }

  finish(reason: "last_standing" | "time" | "host") {
    if (this.game.status === "ended") return;
    const alive = this.alive();
    let winner: Player | null = null;
    if (alive.length === 1) {
      winner = alive[0];
    } else if (alive.length > 1) {
      const sorted = [...alive].sort(
        (a, b) =>
          b.killCount - a.killCount ||
          (a.lastKillAt?.getTime() ?? Infinity) - (b.lastKillAt?.getTime() ?? Infinity),
      );
      // Everyone on 0 kills: no automatic winner, Afam picks.
      if (sorted[0].killCount > 0) winner = sorted[0];
    }
    this.game.status = "ended";
    this.game.endedAt = this.now;
    this.game.pausedAt = null;
    this.game.winnerId = winner?.id ?? null;
    this.event("end", null, winner?.id ?? null, { reason });
    this.notify(null, "game_over");
  }

  // ── guards ──

  requireActive() {
    if (this.game.status === "paused") throw new GameError("paused", "The game is paused.");
    if (this.game.status !== "active") throw new GameError("not_active", "The game isn't running.");
  }

  requireAlive(p: Player) {
    if (p.status !== "alive") throw new GameError("not_alive", "You're not in the game.");
  }

  protectedUntil(p: Player): Date | null {
    const times = [p.graceUntil, p.shieldUntil].filter((t): t is Date => !!t && t > this.now);
    if (times.length === 0) return null;
    return new Date(Math.max(...times.map((t) => t.getTime())));
  }
}

// ─────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────

/** Player taps "I'm here". Before start: ready to play. After start: queued or spectator. */
export function checkIn(state: GameState, ctx: Ctx, playerId: string): ActionResult {
  const d = new Draft(state, ctx);
  const p = d.player(playerId);
  if (p.status !== "registered") return d.result(); // already checked in: no-op
  p.checkedInAt = d.now;

  if (d.game.status === "setup") {
    p.status = "checked_in";
    d.event("check_in", p.id, null);
    return d.result();
  }
  if (d.game.status === "ended") {
    p.status = "checked_in";
    return d.result();
  }

  if (joinCutoffReached(d)) {
    p.status = "checked_in"; // spectator / ghost
    d.event("check_in", p.id, null, { late: true, spectator: true });
  } else {
    p.status = "queued";
    p.queuedAt = d.now;
    d.event("check_in", p.id, null, { late: true, queued: true });
  }
  return d.result();
}

function joinCutoffReached(d: Draft): boolean {
  const s = d.settings;
  if (d.alive().length <= s.joinCutoffPlayers) return true;
  if (!s.joinCutoffMinutes) return false; // no time limit
  const started = d.game.startedAt;
  return !!started && d.now.getTime() - started.getTime() >= s.joinCutoffMinutes * 60_000;
}

/** Afam hits Start: shuffle checked-in players into one loop. */
export function startGame(state: GameState, ctx: Ctx, opts: { durationMinutes?: number; duplicateAcknowledgment?: string } = {}): ActionResult {
  const d = new Draft(state, ctx);
  if (d.game.status !== "setup") throw new GameError("already_started", "The game has already started.");
  const ready = d.state.players.filter((p) => p.status === "checked_in");
  if (ready.length < 3) throw new GameError("too_few", "Need at least 3 checked-in players to start.");
  const capacity = missionCapacity(d.state);
  if (capacity.requiresDuplicates && opts.duplicateAcknowledgment !== capacity.acknowledgment) {
    throw new GameError("duplicate_ack_required", "There aren't enough unique tasks for this player count and the early-game difficulty limit. Review the task warning and explicitly acknowledge sharing tasks across players before starting.");
  }
  d.settings.missionMode = capacity.requiresDuplicates ? "duplicate" : "unique";

  // Fisher–Yates shuffle
  const order = [...ready];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.forEach((p, i) => {
    p.targetId = order[(i + 1) % order.length].id;
    p.status = "alive";
    p.code = d.uniqueCode();
    p.rerollsLeft = 1;
  });
  d.game.status = "active";
  d.game.startedAt = d.now;
  const minutes = opts.durationMinutes ?? d.settings.defaultDurationMinutes;
  d.game.targetEndAt = new Date(d.now.getTime() + minutes * 60_000);
  for (const p of order) d.assignMission(p);

  d.event("start", null, null, { players: order.length, durationMinutes: minutes, missionMode: d.settings.missionMode });
  d.notify(null, "game_started");
  return d.result();
}

// ─────────────────────────────────────────────
// Player actions
// ─────────────────────────────────────────────

/** Killer enters the victim's 4-digit code. */
export function submitKill(state: GameState, ctx: Ctx, killerId: string, code: string): ActionResult {
  const d = new Draft(state, ctx);
  d.requireActive();
  const killer = d.player(killerId);
  d.requireAlive(killer);
  const victim = d.player(killer.targetId!);
  if (victim.code !== code.trim()) throw new GameError("wrong_code", "That code doesn't match your target.");
  const until = d.protectedUntil(victim);
  if (until) {
    const mins = Math.ceil((until.getTime() - d.now.getTime()) / 60_000);
    throw new GameError("protected", `They're protected for ${mins} more minute${mins === 1 ? "" : "s"}.`);
  }
  applyKill(d, killer, victim, { forced: false });
  return d.result();
}

function applyKill(d: Draft, killer: Player, victim: Player, opts: { forced: boolean }) {
  const missionId = killer.missionId;
  d.takeOut(victim, "kill", killer.id);
  d.creditKill(killer);
  d.event("kill", killer.id, victim.id, { missionId, forced: opts.forced });
  d.notify(victim.id, "eliminated");
  if (killer.targetId !== killer.id) d.newTarget(killer);
  else killer.missionId = null;
  d.spliceQueuedAfterKill(killer);
  d.endIfOver();
}

/** Killer adds a one-line story after a kill (shown at the end reveal). */
export function addKillStory(state: GameState, ctx: Ctx, killerId: string, victimId: string, story: string): ActionResult {
  const d = new Draft(state, ctx);
  const victim = d.player(victimId);
  if (victim.outBy !== killerId) throw new GameError("not_your_kill", "That wasn't your kill.");
  d.event("kill_story", killerId, victimId, { story: story.trim().slice(0, 280) });
  return d.result();
}

/** Accuser guesses who is hunting them. */
export function accuse(state: GameState, ctx: Ctx, accuserId: string, suspectId: string): ActionResult {
  const d = new Draft(state, ctx);
  d.requireActive();
  const accuser = d.player(accuserId);
  d.requireAlive(accuser);
  if (bonusMoveUsed(accuser)) throw new GameError("no_bonus", "You've already used your bonus action.");
  if (suspectId === accuserId) throw new GameError("self", "You can't accuse yourself.");
  const suspect = d.player(suspectId);
  if (suspect.status !== "alive") throw new GameError("suspect_out", "That player isn't in the game.");

  accuser.accusationsUsed += 1;
  const hunter = d.hunterOf(accuser.id);

  if (hunter.id === suspect.id) {
    // Correct: hunter is out; their hunter now hunts the accuser.
    const nextHunter = d.takeOut(hunter, "accusation", accuser.id);
    d.creditKill(accuser);
    d.event("accuse_right", accuser.id, hunter.id);
    d.notify(hunter.id, "eliminated");
    if (nextHunter && nextHunter.id !== accuser.id) d.newTarget(nextHunter);
    if (accuser.targetId === accuser.id) accuser.missionId = null;
    d.spliceQueuedAfterKill(accuser);
    d.endIfOver();
  } else {
    // Wrong: nothing happens, except the bonus action is spent.
    d.event("accuse_wrong", accuser.id, suspect.id);
  }
  return d.result();
}

/**
 * Each player gets ONE bonus action per game: guess their hunter OR swap their
 * hunter. Using either uses it up.
 */
export function bonusMoveUsed(p: Player): boolean {
  return p.rerollsLeft <= 0 || p.accusationsUsed > 0;
}

/** Player swaps their mission (once per game). */
export function reroll(state: GameState, ctx: Ctx, playerId: string): ActionResult {
  const d = new Draft(state, ctx);
  d.requireActive();
  const p = d.player(playerId);
  d.requireAlive(p);
  if (bonusMoveUsed(p)) throw new GameError("no_bonus", "You've already used your bonus action.");
  p.rerollsLeft -= 1;
  d.assignMission(p);
  d.event("reroll", p.id, null, { missionId: p.missionId });
  return d.result();
}

/** Player taps "I'm leaving", or Afam taps Remove. */
export function removePlayer(state: GameState, ctx: Ctx, playerId: string, reason: "removed" | "left"): ActionResult {
  const d = new Draft(state, ctx);
  const p = d.player(playerId);
  if (p.status === "queued" || p.status === "registered" || p.status === "checked_in") {
    p.status = "left";
    p.outAt = d.now;
    p.outReason = reason;
    p.queuedAt = null;
    d.event(reason === "left" ? "leave" : "remove", null, p.id);
    return d.result();
  }
  if (p.status !== "alive") return d.result();
  const h = d.takeOut(p, reason, null);
  d.event(reason === "left" ? "leave" : "remove", null, p.id);
  if (h && h.targetId !== h.id) d.newTarget(h);
  else if (h) h.missionId = null;
  if (d.game.status === "active" || d.game.status === "paused") d.endIfOver();
  return d.result();
}

// ─────────────────────────────────────────────
// Host (Afam) actions
// ─────────────────────────────────────────────

export function skipMission(state: GameState, ctx: Ctx, playerId: string): ActionResult {
  const d = new Draft(state, ctx);
  const p = d.player(playerId);
  d.requireAlive(p);
  d.assignMission(p);
  d.event("skip", null, p.id, { missionId: p.missionId });
  d.notify(p.id, "new_target");
  return d.result();
}

/** Pull a player out and splice them in elsewhere, optionally away from someone they're too close to. */
export function movePlayer(state: GameState, ctx: Ctx, playerId: string, awayFromId?: string): ActionResult {
  const d = new Draft(state, ctx);
  const x = d.player(playerId);
  d.requireAlive(x);
  if (d.alive().length < 4) throw new GameError("too_few", "Not enough players left to move anyone.");

  const oldHunter = d.unlink(x);
  if (oldHunter) d.newTarget(oldHunter);

  // A becomes x's hunter; A's old target becomes x's target.
  // Prefer a new spot (not back where x was) that keeps x away from awayFromId.
  const others = d.alive().filter((p) => p.id !== x.id);
  const newSpot = others.filter((a) => a.id !== oldHunter?.id);
  const good = newSpot.filter((a) => a.id !== awayFromId && a.targetId !== awayFromId);
  const a = d.pick(good.length ? good : newSpot.length ? newSpot : others);
  d.spliceAfter(a, x);
  d.newTarget(a);
  d.newTarget(x);
  d.event("move", null, x.id, { awayFrom: awayFromId ?? null });
  return d.result();
}

export function pauseGame(state: GameState, ctx: Ctx): ActionResult {
  const d = new Draft(state, ctx);
  if (d.game.status !== "active") throw new GameError("not_active", "The game isn't running.");
  d.game.status = "paused";
  d.game.pausedAt = d.now;
  d.event("pause", null, null);
  d.notify(null, "paused");
  return d.result();
}

/** Resume, pushing every timer forward by however long the pause lasted. */
export function resumeGame(state: GameState, ctx: Ctx): ActionResult {
  const d = new Draft(state, ctx);
  if (d.game.status !== "paused" || !d.game.pausedAt) throw new GameError("not_paused", "The game isn't paused.");
  const shift = d.now.getTime() - d.game.pausedAt.getTime();
  const push = (t: Date | null) => (t ? new Date(t.getTime() + shift) : t);
  d.game.targetEndAt = push(d.game.targetEndAt);
  d.game.startedAt = push(d.game.startedAt); // keeps the join cutoff honest too
  for (const p of d.state.players) {
    p.graceUntil = push(p.graceUntil);
    p.shieldUntil = push(p.shieldUntil);
    p.queuedAt = push(p.queuedAt);
  }
  d.game.status = "active";
  d.game.pausedAt = null;
  d.event("resume", null, null, { pausedMs: shift });
  d.notify(null, "resumed");
  return d.result();
}

export function setEndTime(state: GameState, ctx: Ctx, targetEndAt: Date): ActionResult {
  const d = new Draft(state, ctx);
  if (d.game.status === "ended") throw new GameError("ended", "The game is over.");
  d.game.targetEndAt = targetEndAt;
  d.event("extend", null, null, { targetEndAt: targetEndAt.toISOString() });
  d.notify(null, "end_time_changed");
  return d.result();
}

export function endGame(state: GameState, ctx: Ctx): ActionResult {
  const d = new Draft(state, ctx);
  if (d.game.status === "setup") throw new GameError("not_started", "The game hasn't started.");
  d.finish("host");
  return d.result();
}

/**
 * "Play again with the same players": put an ended game back to the start.
 * Everyone who played (or was waiting) is checked back in with the same
 * personal link; people who left the party stay out. Afam then hits Start.
 */
export function resetGame(state: GameState, ctx: Ctx): ActionResult {
  const d = new Draft(state, ctx);
  if (d.game.status !== "ended") throw new GameError("not_ended", "End the game before starting a new round.");
  for (const p of d.state.players) {
    if (["alive", "eliminated", "queued", "checked_in"].includes(p.status)) p.status = "checked_in";
    p.code = null;
    p.targetId = null;
    p.missionId = null;
    p.missionsSeen = [];
    p.rerollsLeft = 1;
    p.accusationsUsed = 0;
    p.bonusAccusationEarned = false;
    p.killCount = 0;
    p.lastKillAt = null;
    p.hintTierRevealed = 0;
    p.graceUntil = null;
    p.shieldUntil = null;
    p.queuedAt = null;
    if (p.status !== "left") {
      p.outAt = null;
      p.outReason = null;
      p.outBy = null;
    }
    p.betOnId = null;
    p.poltergeistUsed = false;
  }
  d.game.status = "setup";
  d.game.startedAt = null;
  d.game.targetEndAt = null;
  d.game.pausedAt = null;
  d.game.endedAt = null;
  d.game.winnerId = null;
  d.settings.usedMissionIds = [];
  d.settings.usedMissionTexts = [];
  d.settings.playerMissionTexts = {};
  d.settings.missionMode = "duplicate";
  d.event("reset", null, null, { players: d.state.players.filter((p) => p.status === "checked_in").length });
  d.notify(null, "game_started");
  return d.result();
}

/** Afam picks the winner when the game ended with nobody on any kills. */
export function setWinner(state: GameState, ctx: Ctx, playerId: string): ActionResult {
  const d = new Draft(state, ctx);
  if (d.game.status !== "ended") throw new GameError("not_ended", "The game isn't over yet.");
  d.player(playerId);
  d.game.winnerId = playerId;
  d.event("winner_set", null, playerId);
  return d.result();
}

/** Dispute upheld: eliminate the target as if their code had been entered. */
export function forceKill(state: GameState, ctx: Ctx, killerId: string): ActionResult {
  const d = new Draft(state, ctx);
  d.requireActive();
  const killer = d.player(killerId);
  d.requireAlive(killer);
  applyKill(d, killer, d.player(killer.targetId!), { forced: true });
  return d.result();
}

/** Afam sends a hint (a player's custom hint or free text) to whoever is hunting that player. */
export function sendHostHint(state: GameState, ctx: Ctx, aboutPlayerId: string, text?: string): ActionResult {
  const d = new Draft(state, ctx);
  const about = d.player(aboutPlayerId);
  d.requireAlive(about);
  const body = (text ?? about.customHint ?? "").trim();
  if (!body) throw new GameError("no_hint", "No hint to send.");
  const hunter = d.hunterOf(about.id);
  d.hints.push({ toPlayerId: hunter.id, aboutPlayerId: about.id, source: text ? "host" : "custom", text: body });
  d.notify(hunter.id, "hint");
  d.event("hint", null, about.id, { to: hunter.id, source: text ? "host" : "custom" });
  return d.result();
}

// ─────────────────────────────────────────────
// Ghost actions
// ─────────────────────────────────────────────

function requireGhost(p: Player) {
  const ghost = p.status === "eliminated" || p.status === "checked_in";
  if (!ghost) throw new GameError("not_ghost", "Only players who are out can do this.");
}

export function placeBet(state: GameState, ctx: Ctx, playerId: string, onId: string): ActionResult {
  const d = new Draft(state, ctx);
  if (d.game.status === "ended" || d.game.status === "setup") throw new GameError("not_active", "Betting is closed.");
  const p = d.player(playerId);
  requireGhost(p);
  if (p.betOnId) throw new GameError("already_bet", "You've already placed your bet.");
  if (d.player(onId).status !== "alive") throw new GameError("not_alive", "You can only bet on someone still in.");
  p.betOnId = onId;
  d.event("bet", p.id, onId);
  return d.result();
}

export function poltergeist(state: GameState, ctx: Ctx, ghostId: string, toId: string, text: string): ActionResult {
  const d = new Draft(state, ctx);
  d.requireActive();
  const g = d.player(ghostId);
  requireGhost(g);
  if (g.poltergeistUsed) throw new GameError("used", "You've already sent your anonymous hint.");
  const to = d.player(toId);
  d.requireAlive(to);
  const body = text.trim().slice(0, 140);
  if (!body) throw new GameError("empty", "Write something first.");
  g.poltergeistUsed = true;
  d.hints.push({ toPlayerId: to.id, aboutPlayerId: null, source: "poltergeist", text: body });
  d.notify(to.id, "hint");
  d.event("poltergeist", g.id, to.id);
  return d.result();
}

// ─────────────────────────────────────────────
// Timers
// ─────────────────────────────────────────────

/**
 * Applies anything that's come due: the end time, and splice-in for queued
 * players who have waited too long without a kill. Runs on every action and
 * every ~30s from the admin page. Returns null when nothing changed.
 */
export function tick(state: GameState, ctx: Ctx): ActionResult | null {
  if (state.game.status !== "active") return null;
  const d = new Draft(state, ctx);

  if (d.game.targetEndAt && d.now >= d.game.targetEndAt) {
    d.finish("time");
    return d.result();
  }

  const waitMs = d.settings.spliceFallbackMinutes * 60_000;
  for (const q of d.queued()) {
    if (!q.queuedAt || d.now.getTime() - q.queuedAt.getTime() < waitMs) continue;
    const alive = d.alive();
    if (alive.length === 0) break;
    // Allocate the complete splice on a separate draft. Exhaustion must not
    // leave half a splice behind or block unrelated actions and host recovery.
    const attempt = new Draft(d.state, ctx);
    const a = attempt.pick(attempt.alive());
    const newcomer = attempt.player(q.id);
    try {
      attempt.spliceAfter(a, newcomer);
      attempt.enterLoop(newcomer, true);
      if (a.targetId !== a.id) attempt.newTarget(a);
      attempt.event("splice", null, newcomer.id, { after: a.id, via: "fallback" });
    } catch (error) {
      if (error instanceof GameError && error.code === "no_fresh_missions") continue;
      throw error;
    }
    d.state = attempt.state;
    d.events.push(...attempt.events);
    d.hints.push(...attempt.hints);
    d.notifications.push(...attempt.notifications);
  }

  return d.events.length ? d.result() : null;
}
