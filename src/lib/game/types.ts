// Core game types. These mirror the database tables
// (supabase/migrations/0001_init.sql) in camelCase.

export type GameStatus = "setup" | "active" | "paused" | "ended";

export type PlayerStatus =
  | "registered" // signed up, not at the bar yet
  | "checked_in" // at the bar; before start = waiting, after start = spectator (joined after cutoff)
  | "queued" // arrived after start, waiting to be spliced into the loop
  | "alive"
  | "eliminated"
  | "left";

export type OutReason = "kill" | "accusation" | "removed" | "left";
export type Difficulty = "E" | "M" | "H";
export type HintSource = "group" | "outfit" | "custom" | "initial" | "poltergeist" | "host";

export interface Settings {
  graceMinutes: number;
  shieldMinutes: number;
  bonusAccusationAtKills: number;
  spliceFallbackMinutes: number;
  joinCutoffPlayers: number;
  joinCutoffMinutes: number;
  /** Hard missions only get handed out once this many players (or fewer) are alive. */
  hardMissionsAtAlive: number;
  silentFinal: boolean;
  /** Afam's bar tab: while open, each catch earns a drink (honor system). */
  barTabOpen: boolean;
  defaultDurationMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  graceMinutes: 10,
  shieldMinutes: 10,
  bonusAccusationAtKills: 3,
  spliceFallbackMinutes: 5,
  joinCutoffPlayers: 5,
  joinCutoffMinutes: 90,
  hardMissionsAtAlive: 5,
  silentFinal: false,
  barTabOpen: true,
  defaultDurationMinutes: 150,
};

export interface Game {
  id: string;
  name: string;
  status: GameStatus;
  startedAt: Date | null;
  targetEndAt: Date | null;
  pausedAt: Date | null;
  endedAt: Date | null;
  winnerId: string | null;
  settings: Settings;
}

export interface Player {
  id: string;
  firstName: string;
  howKnowAfam: string | null;
  topColor: string | null;
  accessory: string | null;
  customHint: string | null;
  status: PlayerStatus;
  code: string | null;
  targetId: string | null;
  missionId: string | null;
  missionsSeen: string[];
  rerollsLeft: number;
  accusationsUsed: number;
  bonusAccusationEarned: boolean;
  killCount: number;
  lastKillAt: Date | null;
  hintTierRevealed: number;
  graceUntil: Date | null;
  shieldUntil: Date | null;
  checkedInAt: Date | null;
  queuedAt: Date | null;
  outAt: Date | null;
  outReason: OutReason | null;
  outBy: string | null;
  betOnId: string | null;
  poltergeistUsed: boolean;
}

export interface Mission {
  id: string;
  text: string;
  difficulty: Difficulty;
  active: boolean;
}

export interface GameState {
  game: Game;
  players: Player[];
  missions: Mission[];
}

export interface GameEvent {
  type: string;
  actorId: string | null;
  subjectId: string | null;
  data: Record<string, unknown>;
}

export interface NewHint {
  toPlayerId: string;
  aboutPlayerId: string | null;
  source: HintSource;
  text: string;
}

export type NotificationKind =
  | "game_started"
  | "new_target"
  | "eliminated"
  | "game_over"
  | "hint"
  | "paused"
  | "resumed"
  | "end_time_changed";

export interface Notification {
  /** null = everyone */
  playerId: string | null;
  kind: NotificationKind;
}

/** Everything an action produced. The database layer saves it all in one transaction. */
export interface ActionResult {
  state: GameState;
  events: GameEvent[];
  hints: NewHint[];
  notifications: Notification[];
}

/** Injected so tests can control time and randomness. */
export interface Ctx {
  now: Date;
  random: () => number;
}

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "GameError";
  }
}
