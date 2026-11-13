// Turns event-log rows into readable lines for the admin feed and the reveal.

export interface FeedEvent {
  type: string;
  actor_id: string | null;
  subject_id: string | null;
  data: Record<string, unknown>;
}

export function describeEvent(e: FeedEvent, name: (id: string | null) => string): string | null {
  const a = name(e.actor_id);
  const s = name(e.subject_id);
  switch (e.type) {
    case "start":
      return `Game started with ${e.data.players} players.`;
    case "check_in":
      return e.data.late ? `${a} arrived late${e.data.queued ? " (queued)" : " (spectating)"}.` : `${a} checked in.`;
    case "kill":
      return `${a} denied ${s}'s visa${e.data.forced ? " (dispute upheld)" : ""}.`;
    case "kill_story":
      return `${a} on ${s}: “${e.data.story}”`;
    case "accuse_right":
      return `${a} caught their hunter ${s}.`;
    case "accuse_wrong":
      return `${a} wrongly accused ${s}.`;
    case "splice":
      return `${s} joined the loop.`;
    case "remove":
      return `${s} was removed.`;
    case "leave":
      return `${s} left the party.`;
    case "move":
      return `${s} was moved.`;
    case "reroll":
      return `${a} swapped their task.`;
    case "skip":
      return `${s} got a new task from the host.`;
    case "pause":
      return "Game paused.";
    case "resume":
      return "Game resumed.";
    case "extend":
      return "End time changed.";
    case "end":
      return `Game over (${e.data.reason === "time" ? "time's up" : e.data.reason === "host" ? "ended by host" : "last one standing"}).`;
    case "hint":
      return `Hint about ${s} sent to their hunter.`;
    case "broadcast":
      return `📣 ${e.data.text}`;
    case "cant_find":
      return `${a} can't find their target ${s}.`;
    case "dispute":
      return `${a} disputed ${s}${e.data.note ? `: “${e.data.note}”` : "."}`;
    case "dispute_resolved":
      return `Dispute over ${s} ${e.data.upheld ? "upheld" : "rejected"}.`;
    case "bet":
      return `${a} bet on ${s}.`;
    case "poltergeist":
      return `${a} haunted ${s}.`;
    case "mission_added":
      return `New mission: ${e.data.text}`;
    case "winner_set":
      return `${s} declared winner.`;
    default:
      return null;
  }
}
