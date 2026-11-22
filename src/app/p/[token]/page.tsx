import { notFound } from "next/navigation";
import { connection } from "next/server";
import { gameById, hintsTo, latestBroadcast, missionText, playerByToken, playersOf, serverNow } from "@/lib/db/queries";
import { inboxForPlayer, notificationsEnabled } from "@/lib/notifications";
import { PlayerView, type PlayerViewData } from "./PlayerView";

export default async function PlayerPage({ params }: PageProps<"/p/[token]">) {
  await connection();
  const { token } = await params;
  const me = await playerByToken(token);
  if (!me) notFound();
  const game = await gameById(me.game_id);
  if (!game) notFound();

  const enabled = notificationsEnabled();
  const [players, hints, broadcast, mission, notifications] = await Promise.all([
    playersOf(game.id),
    hintsTo(me.id),
    latestBroadcast(game.id),
    missionText(me.mission_id),
    enabled ? inboxForPlayer(me.id) : Promise.resolve([]),
  ]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const target = me.target_id ? byId.get(me.target_id) : undefined;
  const alive = players.filter((p) => p.status === "alive");
  const isGhost = me.status === "eliminated" || (me.status === "checked_in" && game.status !== "setup");
  const now = serverNow();
  const future = (d: Date | null) => (d && d.getTime() > now ? d.toISOString() : null);

  const data: PlayerViewData = {
    token,
    notifications,
    notificationsEnabled: enabled,
    me: {
      id: me.id,
      firstName: me.first_name,
      photoUrl: me.photo_url,
      status: me.status,
      code: me.code,
      bonusUsed: me.rerolls_left <= 0 || me.accusations_used > 0,
      killCount: me.kill_count,
      graceUntil: future(me.grace_until),
      shieldUntil: future(me.shield_until),
      topColor: me.top_color,
      accessory: me.accessory,
      outReason: me.out_reason,
      outByName: me.out_by ? (byId.get(me.out_by)?.first_name ?? null) : null,
      betOnName: me.bet_on_id ? (byId.get(me.bet_on_id)?.first_name ?? null) : null,
      betOnPhoto: me.bet_on_id ? (byId.get(me.bet_on_id)?.photo_url ?? null) : null,
      poltergeistUsed: me.poltergeist_used,
    },
    game: {
      id: game.id,
      status: game.status,
      targetEndAt: game.targetEndAt?.toISOString() ?? null,
      winnerName: game.winnerId ? (byId.get(game.winnerId)?.first_name ?? null) : null,
      settings: {
        bonusAt: game.settings.bonusAccusationAtKills,
        barTabOpen: game.settings.barTabOpen,
        ticketHostPhotoUrl: game.settings.ticketHostPhotoUrl,
        joinCutoff: game.settings.joinCutoffPlayers,
      },
    },
    target: target
      ? { id: target.id, firstName: target.first_name, photoUrl: target.photo_url, how: target.how_know_afam }
      : null,
    mission,
    hints: hints
      .filter((h) => h.about_player_id === null || h.about_player_id === me.target_id)
      .map((h) => ({ id: h.id, text: h.text, anonymous: h.source === "poltergeist", at: h.created_at.toISOString() })),
    aliveCount: alive.length,
    outNames: players
      .filter((p) => p.status === "eliminated" || p.status === "left")
      .sort((a, b) => (b.out_at?.getTime() ?? 0) - (a.out_at?.getTime() ?? 0))
      .map((p) => p.first_name),
    others: alive
      .filter((p) => p.id !== me.id)
      // Catch counts are secret during the game, except to people who are out (for betting).
      .map((p) => ({ id: p.id, firstName: p.first_name, photoUrl: p.photo_url, kills: isGhost ? p.kill_count : undefined })),
    broadcast: (broadcast?.data?.text as string) ?? null,
  };

  return <PlayerView data={data} />;
}
