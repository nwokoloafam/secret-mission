import { describe, expect, it } from "vitest";
import { getMissionCapacity } from "./mission-pool";
import { DEFAULT_SETTINGS, Mission } from "./types";

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, status: "checked_in" as const }));
const pool = (early: number, hard: number): Mission[] => [
  ...Array.from({ length: early }, (_, i) => ({ id: `e${i}`, text: `Early ${i}`, difficulty: "E" as const, active: true })),
  ...Array.from({ length: hard }, (_, i) => ({ id: `h${i}`, text: `Hard ${i}`, difficulty: "H" as const, active: true })),
];

describe("mission capacity", () => {
  it("budgets a 50% swap buffer and separates late hard tasks for 33 players", () => {
    expect(getMissionCapacity(players(33), pool(77, 4), DEFAULT_SETTINGS)).toMatchObject({
      playerCount: 33, swapBuffer: 17, totalRequired: 81, earlyRequired: 77, hardRequired: 4,
      totalAvailable: 81, earlyAvailable: 77, hardAvailable: 4, requiresDuplicates: false,
    });
  });

  it("warns for an early shortage even when the total is sufficient", () => {
    expect(getMissionCapacity(players(33), pool(76, 5), DEFAULT_SETTINGS)).toMatchObject({
      requiresDuplicates: false, bufferShort: true, baseTotalRequired: 64, baseEarlyRequired: 60,
    });
  });

  it("uses all difficulties for a round starting at or below the hard threshold", () => {
    expect(getMissionCapacity(players(5), pool(0, 16), DEFAULT_SETTINGS)).toMatchObject({
      totalRequired: 11, baseTotalRequired: 8, earlyRequired: 0, hardRequired: 0, requiresDuplicates: false,
    });
  });

  it("deduplicates text and counts an eligible easy alias independently of its hard copy", () => {
    const missions = pool(1, 1);
    missions[1].text = `  ${missions[0].text.toUpperCase().replace(" ", "   ")}  `;
    expect(getMissionCapacity(players(6), missions.reverse(), DEFAULT_SETTINGS)).toMatchObject({ totalAvailable: 1, earlyAvailable: 1 });
  });

  it("acknowledgment ignores order but changes with roster, active tasks, difficulty, or threshold", () => {
    const roster = players(8);
    const missions = pool(10, 1);
    const capacity = getMissionCapacity(roster, missions, DEFAULT_SETTINGS);
    const ack = capacity.acknowledgment;
    expect(getMissionCapacity([...roster].reverse(), [...missions].reverse(), DEFAULT_SETTINGS).acknowledgment).toBe(ack);
    expect(getMissionCapacity(roster.slice(1), missions, DEFAULT_SETTINGS).acknowledgment).not.toBe(ack);
    expect(getMissionCapacity(roster, missions, { hardMissionsAtAlive: 6 }).acknowledgment).not.toBe(ack);
    expect(getMissionCapacity(roster, missions.map((m, i) => i ? m : { ...m, active: false }), DEFAULT_SETTINGS).acknowledgment).not.toBe(ack);
    expect(getMissionCapacity(roster, missions.map((m, i) => i ? m : { ...m, difficulty: "H" }), DEFAULT_SETTINGS).acknowledgment).not.toBe(ack);
  });
});
