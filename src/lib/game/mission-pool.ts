import type { GameState, Mission, Settings } from "./types";

export const normalizeMissionText = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

/** Filter eligibility before deduplicating: an easy copy remains usable early. */
export function distinctMissions(missions: Mission[]): Mission[] {
  const seen = new Set<string>();
  return missions.filter((mission) => {
    const text = normalizeMissionText(mission.text);
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

export function getMissionCapacity(
  players: { id: string; status: string }[],
  missions: Mission[],
  settings: Pick<Settings, "hardMissionsAtAlive">,
) {
  const ready = players.filter((p) => p.status === "checked_in");
  const playerCount = ready.length;
  const active = missions.filter((m) => m.active);
  const totalAvailable = distinctMissions(active).length;
  const hardAt = Math.max(0, Math.floor(settings.hardMissionsAtAlive));
  const earlyAvailable = distinctMissions(active.filter((m) => m.difficulty !== "H")).length;
  const hardAvailable = distinctMissions(active.filter((m) => m.difficulty === "H")).length;
  // Plan for roughly half of the checked-in players to use their optional swap.
  const swapBuffer = Math.ceil(playerCount / 2);
  const hasEarlyPhase = playerCount > hardAt;
  const baseEarlyRequired = hasEarlyPhase
    ? playerCount + Math.max(0, playerCount - Math.max(1, hardAt) - 1)
    : 0;
  // From the threshold down to one survivor, each non-final catch can need a task.
  const hardRequired = hasEarlyPhase ? Math.max(0, hardAt - 1) : 0;
  const baseTotalRequired = hasEarlyPhase
    ? baseEarlyRequired + hardRequired
    : playerCount + Math.max(0, playerCount - 2);
  // Late assignments can use remaining Easy/Medium tasks too; Hard is optional.
  const requiresDuplicates = totalAvailable < baseTotalRequired || earlyAvailable < baseEarlyRequired;
  const earlyRequired = baseEarlyRequired + (hasEarlyPhase ? swapBuffer : 0);
  const totalRequired = baseTotalRequired + swapBuffer;
  const bufferShort = totalAvailable < totalRequired || earlyAvailable < earlyRequired;

  // A stale acknowledgment must not start a changed roster or task pool.
  const signature = JSON.stringify([
    ready.map((p) => p.id).sort(), hardAt,
    active.map((m) => [m.id, normalizeMissionText(m.text), m.difficulty]).sort((a, b) => a[0].localeCompare(b[0])),
  ]);
  let hash = 2166136261;
  for (let i = 0; i < signature.length; i++) hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
  const acknowledgment = `mission-capacity-v2-${(hash >>> 0).toString(16)}`;
  return { playerCount, totalAvailable, earlyAvailable, hardAvailable, totalRequired, earlyRequired, hardRequired,
    baseTotalRequired, baseEarlyRequired, swapBuffer, bufferShort, requiresDuplicates, acknowledgment };
}

export const missionCapacity = (state: GameState) => getMissionCapacity(state.players, state.missions, state.game.settings);
export type MissionCapacity = ReturnType<typeof getMissionCapacity>;

/** Seed old rounds once; never derive global history only from surviving players. */
export function recordExistingMissionHistory(state: GameState) {
  const settings = state.game.settings;
  const ids = new Set(settings.usedMissionIds ?? []);
  const texts = new Set((settings.usedMissionTexts ?? []).map(normalizeMissionText));
  const byId = new Map(state.missions.map((m) => [m.id, normalizeMissionText(m.text)]));
  settings.playerMissionTexts ??= {};
  for (const p of state.players) {
    if (p.missionId && !p.missionsSeen.includes(p.missionId)) p.missionsSeen.push(p.missionId);
    const personal = new Set((settings.playerMissionTexts[p.id] ?? []).map(normalizeMissionText));
    for (const id of [...p.missionsSeen, ...(p.missionId ? [p.missionId] : [])]) {
      ids.add(id);
      const text = byId.get(id);
      if (text) personal.add(text);
    }
    settings.playerMissionTexts[p.id] = [...personal];
    personal.forEach((text) => texts.add(text));
  }
  // Deleted players' IDs can still supply text if this is the first upgrade action.
  ids.forEach((id) => { const text = byId.get(id); if (text) texts.add(text); });
  settings.usedMissionIds = [...ids];
  settings.usedMissionTexts = [...texts];
  settings.missionMode ??= "duplicate";
}
