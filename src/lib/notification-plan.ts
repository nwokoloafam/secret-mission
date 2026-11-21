import type { ActionResult, GameState, NotificationKind } from "./game/types";

export type PlannedNotification = { playerId: string; kind: string; message: string };
const messages: Record<NotificationKind, string> = {
  game_started: "The game has started. Open your case file.",
  new_target: "Your case file has changed. Open it for your assignment.",
  eliminated: "You are out of the game. Open your page to see what happens next.",
  game_over: "The game is over. Open the reveal to see what happened.",
  hint: "You have a new hint. Open your case file.",
  paused: "The game is paused.", resumed: "The game has resumed.",
  end_time_changed: "The game's end time has changed.",
};

/** Compute private, recipient-specific notices without including secret assignment details. */
export function planNotifications(before: GameState, result: ActionResult): PlannedNotification[] {
  const after = result.state;
  const started = before.game.status === "setup" && after.game.status === "active";
  const planned = new Map<string, PlannedNotification>();
  const add = (playerId: string, kind: NotificationKind) => {
    if (kind === "new_target" && (started || after.game.status === "ended")) return;
    planned.set(`${playerId}:${kind}`, { playerId, kind, message: messages[kind] });
  };
  for (const n of result.notifications) {
    // reset emits game_started for refresh purposes; it is not a start.
    if (n.kind === "game_started" && !started) continue;
    if (n.playerId) {
      const p = after.players.find((x) => x.id === n.playerId);
      if (p && p.status !== "left" && (n.kind !== "new_target" || p.status === "alive")) add(p.id, n.kind);
    } else {
      for (const p of after.players) if (p.status !== "left") add(p.id, n.kind);
    }
  }
  if (before.game.status === "ended" && after.game.status === "setup") {
    for (const p of after.players) if (p.status !== "left") {
      planned.set(`${p.id}:round_reset`, { playerId: p.id, kind: "round_reset", message: "A new round is being prepared. Keep your personal link." });
    }
  }
  const previous = new Map(before.players.map((p) => [p.id, p]));
  for (const p of after.players) {
    const old = previous.get(p.id);
    if (p.status === "alive" && old && (old.targetId !== p.targetId || old.missionId !== p.missionId)) add(p.id, "new_target");
  }
  return [...planned.values()];
}
