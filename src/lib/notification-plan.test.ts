import { describe, expect, it } from "vitest";
import { accuse, checkIn, movePlayer, removePlayer, startGame, submitKill, tick } from "./game/engine";
import { Ctx, DEFAULT_SETTINGS, GameState, Mission, Player } from "./game/types";
import { planNotifications } from "./notification-plan";

const T0 = new Date("2026-11-21T22:00:00Z");
const min = (m: number) => new Date(T0.getTime() + m * 60_000);

function rng(seed: number) {
  // mulberry32: small seeded random so tests are repeatable
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ctx(minutes = 0, seed = 1): Ctx {
  return { now: min(minutes), random: rng(seed) };
}

const missions: Mission[] = [
  ...Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, text: `easy ${i}`, difficulty: "E" as const, active: true })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, text: `medium ${i}`, difficulty: "M" as const, active: true })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `h${i}`, text: `hard ${i}`, difficulty: "H" as const, active: true })),
];

function player(i: number, over: Partial<Player> = {}): Player {
  return {
    id: `p${i}`,
    firstName: `Name${i}`,
    howKnowAfam: `group${i}`,
    topColor: `color${i}`,
    accessory: "none",
    customHint: null,
    status: "checked_in",
    code: null,
    targetId: null,
    missionId: null,
    missionsSeen: [],
    rerollsLeft: 1,
    accusationsUsed: 0,
    bonusAccusationEarned: false,
    killCount: 0,
    lastKillAt: null,
    hintTierRevealed: 0,
    graceUntil: null,
    shieldUntil: null,
    checkedInAt: T0,
    queuedAt: null,
    outAt: null,
    outReason: null,
    outBy: null,
    betOnId: null,
    poltergeistUsed: false,
    ...over,
  };
}

function setup(n: number): GameState {
  return {
    game: {
      id: "g1",
      name: "test",
      status: "setup",
      startedAt: null,
      targetEndAt: null,
      pausedAt: null,
      endedAt: null,
      winnerId: null,
      settings: { ...DEFAULT_SETTINGS },
    },
    players: Array.from({ length: n }, (_, i) => player(i)),
    missions,
  };
}

function started(n: number, seed = 1): GameState {
  return startGame(setup(n), ctx(0, seed)).state;
}

const P = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;
const hunterOf = (s: GameState, id: string) => s.players.find((p) => p.status === "alive" && p.targetId === id)!;

describe("notification recipient isolation", () => {
  it("sends one start notice per player without duplicate assignment notices", () => {
    const s = setup(8); const result = startGame(s, ctx());
    const notices = planNotifications(s, result);
    expect(notices).toHaveLength(8);
    expect(notices.every(n => n.kind === "game_started")).toBe(true);
  });
  it("alerts only the hunter of a removed player about their new assignment", () => {
    const s = started(8); const victim = P(s, "p0"); const hunter = hunterOf(s, victim.id);
    const notices = planNotifications(s, removePlayer(s, ctx(1), victim.id, "left"));
    expect(notices.filter(n => n.kind === "new_target").map(n => n.playerId)).toEqual([hunter.id]);
  });
  it("includes the affected hunter after a correct accusation, without leaking assignments", () => {
    const s = started(8); const accuser = P(s, "p0"); const hunter = hunterOf(s, accuser.id); const next = hunterOf(s, hunter.id);
    const notices = planNotifications(s, accuse(s, ctx(1), accuser.id, hunter.id));
    expect(notices.filter(n => n.kind === "new_target").map(n => n.playerId)).toEqual([next.id]);
    expect(notices.some(n => n.playerId === hunter.id && n.kind === "eliminated")).toBe(true);
    expect(notices.every(n => !n.message.includes(accuser.firstName))).toBe(true);
  });
  it("notifies newly spliced late arrivals and affected hunter after fallback", () => {
    let s = started(8); s.players.push(player(99, { status: "registered" }));
    s = checkIn(s, ctx(1), "p99").state;
    const result = tick(s, ctx(7))!; const notices = planNotifications(s, result);
    expect(notices.filter(n => n.kind === "new_target")).toHaveLength(2);
    expect(notices.some(n => n.playerId === "p99" && n.kind === "new_target")).toBe(true);
  });
  it("alerts all and only changed living assignments after a host move", () => {
    const s = started(8); const result = movePlayer(s, ctx(1), "p0");
    const changed = result.state.players.filter(p => p.status === "alive" && (p.targetId !== P(s,p.id).targetId || p.missionId !== P(s,p.id).missionId)).map(p => p.id).sort();
    const actual = planNotifications(s, result).filter(n => n.kind === "new_target").map(n => n.playerId).sort();
    expect(actual).toEqual(changed);
    expect(new Set(actual).size).toBe(actual.length);
  });
  it("does not notify the winner of a stale assignment on the final catch", () => {
    let s = started(3);
    let killer = P(s, "p0");
    s = submitKill(s, ctx(1), killer.id, P(s, killer.targetId!).code!).state;
    killer = P(s, killer.id);
    const final = submitKill(s, ctx(2), killer.id, P(s, killer.targetId!).code!);
    expect(final.state.game.status).toBe("ended");
    const notices = planNotifications(s, final);
    expect(notices.some(n => n.kind === "game_over")).toBe(true);
    expect(notices.some(n => n.kind === "new_target")).toBe(false);
  });

});
