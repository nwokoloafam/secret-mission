import { describe, expect, it } from "vitest";
import {
  accuse,
  checkIn,
  endGame,
  forceKill,
  movePlayer,
  pauseGame,
  placeBet,
  poltergeist,
  removePlayer,
  resetGame,
  reroll,
  resumeGame,
  startGame,
  submitKill,
  tick,
} from "./engine";
import { nextHintFor } from "./hints";
import { Ctx, DEFAULT_SETTINGS, GameError, GameState, Mission, Player } from "./types";

// ── helpers ──

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
  ...Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, text: `easy ${i}`, difficulty: "E" as const, active: true })),
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

/** Following targets from any alive player visits every alive player exactly once. */
function expectOneLoop(s: GameState) {
  const alive = s.players.filter((p) => p.status === "alive");
  if (alive.length === 0) return;
  const seen = new Set<string>();
  let cur = alive[0];
  for (let i = 0; i < alive.length; i++) {
    expect(cur.status).toBe("alive");
    expect(seen.has(cur.id)).toBe(false);
    seen.add(cur.id);
    cur = P(s, cur.targetId!);
  }
  expect(cur.id).toBe(alive[0].id);
  expect(seen.size).toBe(alive.length);
  for (const p of s.players.filter((x) => x.status !== "alive")) expect(p.targetId).toBeNull();
}

function kill(s: GameState, killerId: string, minutes = 1) {
  const victim = P(s, P(s, killerId).targetId!);
  return submitKill(s, ctx(minutes), killerId, victim.code!);
}

function expectError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    expect((e as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected GameError ${code}`);
}

// ── tests ──

describe("start", () => {
  it("builds one loop with unique codes and early missions", () => {
    const s = started(12);
    expect(s.game.status).toBe("active");
    expect(s.game.targetEndAt).toEqual(min(150));
    expectOneLoop(s);
    const codes = s.players.map((p) => p.code);
    expect(new Set(codes).size).toBe(12);
    codes.forEach((c) => expect(c).toMatch(/^\d{4}$/));
    s.players.forEach((p) => expect(p.missionId!.startsWith("h")).toBe(false));
  });

  it("needs 3 players", () => {
    expectError(() => startGame(setup(2), ctx()), "too_few");
  });

  it("only uses checked-in players", () => {
    const s0 = setup(5);
    s0.players[4].status = "registered";
    const s = startGame(s0, ctx()).state;
    expect(P(s, "p4").status).toBe("registered");
    expect(s.players.filter((p) => p.status === "alive")).toHaveLength(4);
  });
});

describe("kills", () => {
  it("rejects a wrong code", () => {
    const s = started(5);
    expectError(() => submitKill(s, ctx(1), "p0", "xxxx"), "wrong_code");
  });

  it("eliminates the target and passes on their target", () => {
    const s = started(6);
    const victimId = P(s, "p0").targetId!;
    const victimTarget = P(s, victimId).targetId!;
    const r = kill(s, "p0");
    expect(P(r.state, victimId).status).toBe("eliminated");
    expect(P(r.state, victimId).outBy).toBe("p0");
    expect(P(r.state, "p0").targetId).toBe(victimTarget);
    expect(P(r.state, "p0").killCount).toBe(1);
    expect(r.events.map((e) => e.type)).toContain("kill");
    expect(r.notifications).toContainEqual({ playerId: victimId, kind: "eliminated" });
    expectOneLoop(r.state);
  });

  it("is rejected while paused, and resume shifts timers", () => {
    let s = started(5);
    s = pauseGame(s, ctx(10)).state;
    expectError(() => kill(s, "p0", 11), "paused");
    s = resumeGame(s, ctx(30)).state;
    expect(s.game.targetEndAt).toEqual(min(170));
    expect(kill(s, "p0", 31).state.players.filter((p) => p.status === "alive")).toHaveLength(4);
  });

  it("ends the game with the last one standing", () => {
    let s = started(4);
    const first = "p0";
    while (s.game.status === "active") s = kill(s, first).state;
    expect(s.game.winnerId).toBe(first);
    expect(P(s, first).killCount).toBe(3);
  });

  it("forced kill (dispute upheld) works without the code", () => {
    const s = started(5);
    const victimId = P(s, "p2").targetId!;
    const r = forceKill(s, ctx(1), "p2");
    expect(P(r.state, victimId).status).toBe("eliminated");
    expectOneLoop(r.state);
  });
});

describe("accusations", () => {
  it("correct guess: hunter out, accuser gets a kill, no shield", () => {
    const s = started(6);
    const hunter = hunterOf(s, "p0");
    const grand = hunterOf(s, hunter.id);
    const r = accuse(s, ctx(5), "p0", hunter.id);
    const st = r.state;
    expect(P(st, hunter.id).status).toBe("eliminated");
    expect(P(st, hunter.id).outReason).toBe("accusation");
    expect(P(st, "p0").killCount).toBe(1);
    expect(P(st, "p0").shieldUntil).toBeNull();
    expect(P(st, grand.id).targetId).toBe("p0");
    expectOneLoop(st);

    // No protection: the new hunter can catch them right away.
    expect(P(submitKill(st, ctx(6), grand.id, P(st, "p0").code!).state, "p0").status).toBe("eliminated");
  });

  it("wrong guess: nothing happens except the bonus move is spent", () => {
    const s = started(6);
    const hunter = hunterOf(s, "p0");
    const wrong = s.players.find((p) => p.id !== "p0" && p.id !== hunter.id)!;
    const r = accuse(s, ctx(5), "p0", wrong.id);
    expect(r.hints).toHaveLength(0);
    expect(r.state.players.filter((p) => p.status === "alive")).toHaveLength(6);
    expectError(() => accuse(r.state, ctx(6), "p0", hunter.id), "no_bonus");
    expectError(() => reroll(r.state, ctx(6), "p0"), "no_bonus");
  });

  it("no extra guess for making catches", () => {
    let s = started(10);
    s = kill(s, "p0").state;
    s = kill(s, "p0").state;
    s = kill(s, "p0").state;
    const hunter = hunterOf(s, "p0");
    s = accuse(s, ctx(5), "p0", hunter.id).state;
    const wrong = s.players.find((p) => p.status === "alive" && p.id !== "p0" && p.id !== hunterOf(s, "p0").id)!;
    expectError(() => accuse(s, ctx(6), "p0", wrong.id), "no_bonus");
  });

  it("with two left, a correct accusation wins", () => {
    let s = started(3);
    s = kill(s, "p0").state;
    const other = s.players.find((p) => p.status === "alive" && p.id !== "p0")!;
    s = accuse(s, ctx(5), "p0", other.id).state;
    expect(s.game.status).toBe("ended");
    expect(s.game.winnerId).toBe("p0");
  });
});

describe("hints", () => {
  it("escalates outfit → custom → initial", () => {
    const s = started(6);
    const p0 = P(s, "p0");
    p0.customHint = "Loudest laugh in the room";
    p0.accessory = "glasses";
    const sources: string[] = [];
    for (let i = 0; i < 5; i++) {
      const h = nextHintFor(s, "p0");
      if (!h) break;
      sources.push(h.source);
      p0.hintTierRevealed = h.nextTier;
    }
    expect(sources).toEqual(["outfit", "custom", "initial"]);
  });

  it("skips a tier that matches more than half the room", () => {
    const s = started(6);
    s.players.forEach((p) => (p.topColor = "Black"));
    expect(nextHintFor(s, "p0")!.source).toBe("initial");
  });
});

describe("late arrivals", () => {
  it("queue, then splice in at the next kill with grace", () => {
    const s0 = setup(8);
    s0.players.push(player(99, { status: "registered" }));
    let s = startGame(s0, ctx()).state;
    s = checkIn(s, ctx(10), "p99").state;
    expect(P(s, "p99").status).toBe("queued");
    const r = kill(s, "p0", 12);
    s = r.state;
    expect(P(s, "p99").status).toBe("alive");
    expect(P(s, "p0").targetId).toBe("p99");
    expect(P(s, "p99").graceUntil).toEqual(min(22));
    expectOneLoop(s);
    expectError(() => submitKill(s, ctx(13), "p0", P(s, "p99").code!), "protected");
  });

  it("splice in at a random spot after 5 minutes with no kill", () => {
    const s0 = setup(8);
    s0.players.push(player(99, { status: "registered" }));
    let s = startGame(s0, ctx()).state;
    s = checkIn(s, ctx(10), "p99").state;
    expect(tick(s, ctx(14))).toBeNull();
    s = tick(s, ctx(15))!.state;
    expect(P(s, "p99").status).toBe("alive");
    expectOneLoop(s);
  });

  it("can still join hours in (no time limit)", () => {
    const s0 = setup(8);
    s0.players.push(player(99, { status: "registered" }));
    let s = startGame(s0, ctx()).state;
    s = checkIn(s, ctx(240), "p99").state;
    expect(P(s, "p99").status).toBe("queued");
  });

  it("become spectators once it's down to the final 6", () => {
    const s0 = setup(6);
    s0.players.push(player(99, { status: "registered" }));
    let s = startGame(s0, ctx()).state;
    s = checkIn(s, ctx(10), "p99").state;
    expect(P(s, "p99").status).toBe("checked_in");
  });
});

describe("leaving and moving", () => {
  it("leaver's hunter inherits their target, no kill credit", () => {
    const s = started(6);
    const hunter = hunterOf(s, "p3");
    const next = P(s, "p3").targetId;
    const r = removePlayer(s, ctx(5), "p3", "left");
    expect(P(r.state, "p3").status).toBe("left");
    expect(P(r.state, hunter.id).targetId).toBe(next);
    expect(r.state.players.every((p) => p.killCount === 0)).toBe(true);
    expectOneLoop(r.state);
  });

  it("removing down to one player ends the game", () => {
    let s = started(3);
    s = removePlayer(s, ctx(5), "p1", "removed").state;
    s = removePlayer(s, ctx(6), "p2", "removed").state;
    expect(s.game.status).toBe("ended");
    expect(s.game.winnerId).toBe("p0");
  });

  it("move keeps one loop and keeps players apart", () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = started(8, seed);
      const away = P(s, "p0").targetId!; // p0 is "too close" to their target
      const r = movePlayer(s, ctx(5, seed), "p0", away);
      expectOneLoop(r.state);
      expect(P(r.state, "p0").targetId).not.toBe(away);
      expect(hunterOf(r.state, "p0").id).not.toBe(away);
    }
  });
});

describe("ending", () => {
  it("ends at the target time; most kills wins, earliest to reach it breaks ties", () => {
    let s = started(10);
    s = kill(s, "p0", 5).state;
    const other = s.players.find((p) => p.status === "alive" && p.id !== "p0" && p.targetId !== "p0")!;
    s = kill(s, other.id, 6).state;
    const r = tick(s, ctx(150))!;
    expect(r.state.game.status).toBe("ended");
    expect(r.state.game.winnerId).toBe("p0");
  });

  it("no automatic winner when every survivor has zero kills", () => {
    const s = endGame(started(5), ctx(20)).state;
    expect(s.game.status).toBe("ended");
    expect(s.game.winnerId).toBeNull();
  });
});

describe("play again", () => {
  it("resets an ended game with the same players, keeping leavers out", () => {
    let s = started(6);
    s = kill(s, "p0").state;
    const leaver = s.players.find((p) => p.status === "alive" && p.id !== "p0")!.id;
    s = removePlayer(s, ctx(3), leaver, "left").state;
    s = endGame(s, ctx(10)).state;
    const r = resetGame(s, ctx(11));
    const st = r.state;
    expect(st.game.status).toBe("setup");
    expect(st.game.winnerId).toBeNull();
    expect(P(st, leaver).status).toBe("left");
    const back = st.players.filter((p) => p.status === "checked_in");
    expect(back).toHaveLength(5);
    back.forEach((p) => {
      expect(p.killCount).toBe(0);
      expect(p.targetId).toBeNull();
      expect(p.code).toBeNull();
    });
    // and a new round starts cleanly
    const s2 = startGame(st, ctx(12)).state;
    expectOneLoop(s2);
    expect(s2.players.filter((p) => p.status === "alive")).toHaveLength(5);
  });

  it("only works once the game has ended", () => {
    expectError(() => resetGame(started(4), ctx(1)), "not_ended");
  });
});

describe("other actions", () => {
  it("one bonus move: swapping your task uses up your guess too", () => {
    const s = started(5);
    const r = reroll(s, ctx(1), "p0");
    expect(P(r.state, "p0").missionId).not.toBe(P(s, "p0").missionId);
    expectError(() => reroll(r.state, ctx(2), "p0"), "no_bonus");
    expectError(() => accuse(r.state, ctx(2), "p0", hunterOf(r.state, "p0").id), "no_bonus");
  });

  it("ghosts can bet once and send one poltergeist hint", () => {
    let s = started(6);
    const victimId = P(s, "p0").targetId!;
    s = kill(s, "p0").state;
    s = placeBet(s, ctx(2), victimId, "p0").state;
    expectError(() => placeBet(s, ctx(3), victimId, "p0"), "already_bet");
    const r = poltergeist(s, ctx(4), victimId, "p0", "watch your back");
    expect(r.hints[0]).toMatchObject({ toPlayerId: "p0", source: "poltergeist", aboutPlayerId: null });
    expectError(() => poltergeist(r.state, ctx(5), victimId, "p0", "again"), "used");
  });
});

describe("random games never break the loop", () => {
  it("survives random sequences of actions", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed * 7919);
      const s0 = setup(4 + Math.floor(r() * 20));
      for (let i = 0; i < 4; i++) s0.players.push(player(100 + i, { status: "registered" }));
      let s = startGame(s0, ctx(0, seed)).state;
      let t = 0;
      for (let step = 0; step < 80 && s.game.status === "active"; step++) {
        t += 1 + Math.floor(r() * 3);
        const c = ctx(t, seed * 31 + step);
        const alive = s.players.filter((p) => p.status === "alive");
        const a = alive[Math.floor(r() * alive.length)];
        const roll = r();
        try {
          if (roll < 0.45) s = submitKill(s, c, a.id, P(s, a.targetId!).code!).state;
          else if (roll < 0.6) {
            const sus = alive[Math.floor(r() * alive.length)];
            s = accuse(s, c, a.id, sus.id).state;
          } else if (roll < 0.7) s = removePlayer(s, c, a.id, "left").state;
          else if (roll < 0.8) s = movePlayer(s, c, a.id).state;
          else if (roll < 0.9) {
            const reg = s.players.find((p) => p.status === "registered");
            if (reg) s = checkIn(s, c, reg.id).state;
          } else s = tick(s, c)?.state ?? s;
        } catch (e) {
          if (!(e instanceof GameError)) throw e;
        }
        expectOneLoop(s);
      }
    }
  });
});
