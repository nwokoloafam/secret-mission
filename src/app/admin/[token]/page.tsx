import { EmailOutbox } from "@/components/EmailOutbox";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { describeEvent } from "@/lib/describe";
import { allMissions, eventsOf, gameByAdminToken, openDisputes, playersOf, serverNow } from "@/lib/db/queries";
import { AdminView, type AdminData } from "./AdminView";

export default async function AdminPage({ params }: PageProps<"/admin/[token]">) {
  await connection();
  const { token } = await params;
  const game = await gameByAdminToken(token);
  if (!game) notFound();

  const [players, events, disputes, missions] = await Promise.all([
    playersOf(game.id),
    eventsOf(game.id, 200),
    openDisputes(game.id),
    allMissions(),
  ]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string | null) => (id ? (byId.get(id)?.first_name ?? "?") : "—");
  const missionById = new Map(missions.map((m) => [m.id, m.text]));

  // Walk the loop so Afam sees it in order.
  const alive = players.filter((p) => p.status === "alive");
  const order: string[] = [];
  if (alive.length) {
    let cur = alive[0];
    for (let i = 0; i < alive.length && cur; i++) {
      order.push(cur.id);
      cur = byId.get(cur.target_id ?? "")!;
      if (!cur || cur.id === alive[0].id) break;
    }
  }
  const rank = new Map(order.map((id, i) => [id, i]));
  const statusOrder = ["alive", "queued", "checked_in", "registered", "eliminated", "left"];
  const sorted = [...players].sort(
    (a, b) =>
      statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) ||
      (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0) ||
      a.first_name.localeCompare(b.first_name),
  );

  const recent = serverNow() - 30 * 60_000;
  const alerts = events
    .filter((e) => ["cant_find", "leave"].includes(e.type) && e.created_at.getTime() > recent)
    .slice(0, 10)
    .map((e) => ({ id: e.id, text: describeEvent(e, name) ?? e.type, at: e.created_at.toISOString() }));

  const data: AdminData = {
    token,
    game: {
      id: game.id,
      name: game.name,
      status: game.status,
      targetEndAt: game.targetEndAt?.toISOString() ?? null,
      winnerId: game.winnerId,
      defaultDuration: game.settings.defaultDurationMinutes,
      barTabOpen: game.settings.barTabOpen,
    },
    players: sorted.map((p) => ({
      id: p.id,
      token: p.token,
      firstName: p.first_name,
      photoUrl: p.photo_url,
      how: p.how_know_afam,
      status: p.status,
      kills: p.kill_count,
      targetName: p.target_id ? name(p.target_id) : null,
      mission: p.mission_id ? (missionById.get(p.mission_id) ?? null) : null,
      customHint: p.custom_hint,
      outfit: [p.top_color, p.accessory && p.accessory !== "None" ? p.accessory : null].filter(Boolean).join(", "),
    })),
    disputes: disputes.map((d) => ({
      id: d.id,
      text: `${name(d.raised_by)} says ${name(d.against)} won't hand over their code${d.note ? `: “${d.note}”` : "."}`,
    })),
    alerts,
    feed: events
      .slice(0, 60)
      .map((e) => ({ id: e.id, text: describeEvent(e, name), at: e.created_at.toISOString() }))
      .filter((e): e is { id: string; text: string; at: string } => !!e.text),
    missions: missions.map((m) => ({ id: m.id, text: m.text, difficulty: m.difficulty, active: m.active })),
    counts: {
      alive: alive.length,
      checkedIn: players.filter((p) => p.status === "checked_in").length,
      registered: players.filter((p) => p.status === "registered").length,
      queued: players.filter((p) => p.status === "queued").length,
    },
  };

  return <><AdminView data={data} /><div className="page"><EmailOutbox gameId={game.id} /></div></>;
}
