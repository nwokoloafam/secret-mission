import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AutoRefresh, Avatar } from "@/components/ui";
import { COPY } from "@/lib/copy";
import { eventsOf, gameById, playersOf } from "@/lib/db/queries";

export default async function RevealPage({ params }: PageProps<"/reveal/[gameId]">) {
  await connection();
  const { gameId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) notFound();
  const game = await gameById(gameId);
  if (!game) notFound();

  if (game.status !== "ended") {
    return (
      <main className="page" style={{ minHeight: "100dvh", alignContent: "center", textAlign: "center" }}>
        <AutoRefresh seconds={10} />
        <p className="eyebrow">{COPY.endReveal}</p>
        <h1>Decisions pending…</h1>
        <p className="muted">The reveal opens when the game ends.</p>
      </main>
    );
  }

  const [players, eventsDesc] = await Promise.all([playersOf(game.id), eventsOf(game.id, 2000)]);
  const events = [...eventsDesc].reverse();
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string | null) => (id ? (byId.get(id)?.first_name ?? "?") : "?");
  const winner = game.winnerId ? byId.get(game.winnerId) : undefined;

  const stories = new Map<string, string>();
  for (const e of events) if (e.type === "kill_story") stories.set(`${e.actor_id}:${e.subject_id}`, String(e.data.story ?? ""));

  const chain = events
    .filter((e) => e.type === "kill" || e.type === "accuse_right")
    .map((e) => ({
      id: e.id,
      killer: name(e.actor_id),
      victim: name(e.subject_id),
      how: e.type === "accuse_right" ? "caught them hunting" : e.data.forced ? "dispute upheld" : null,
      story: stories.get(`${e.actor_id}:${e.subject_id}`) ?? null,
      at: e.created_at,
    }));

  const played = players.filter((p) => ["alive", "eliminated", "left"].includes(p.status));
  const board = [...played].sort((a, b) => b.kill_count - a.kill_count || a.first_name.localeCompare(b.first_name));
  const leftEarly = players.filter((p) => p.status === "left").map((p) => p.first_name);
  const goodBets = players.filter((p) => p.bet_on_id && p.bet_on_id === game.winnerId).map((p) => p.first_name);
  const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

  return (
    <main className="page wide">
      <header style={{ textAlign: "center" }} className="stack">
        <p className="eyebrow">
          {COPY.gameName} · {COPY.endReveal}
        </p>
        {winner ? (
          <>
            <div style={{ justifySelf: "center" }}>
              <Avatar url={winner.photo_url} name={winner.first_name} size={140} />
            </div>
            <h1 style={{ fontSize: 40 }}>🏆 {winner.first_name}</h1>
            <p className="muted">
              {COPY.winner} awarded · {winner.kill_count} kill{winner.kill_count === 1 ? "" : "s"}
            </p>
          </>
        ) : (
          <h1>Game over</h1>
        )}
      </header>

      <section className="card">
        <h2>Leaderboard</h2>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Kills</th>
              <th>Fate</th>
            </tr>
          </thead>
          <tbody>
            {board.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="row" style={{ gap: 8 }}>
                    <Avatar url={p.photo_url} name={p.first_name} size={28} />
                    {p.first_name}
                  </span>
                </td>
                <td className="mono">{p.kill_count}</td>
                <td className="small muted">
                  {p.status === "alive"
                    ? "Survived"
                    : p.status === "left"
                      ? "Left early"
                      : p.out_by
                        ? `${COPY.eliminated} by ${name(p.out_by)}`
                        : COPY.eliminated}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>The kill chain</h2>
        {chain.length === 0 && <p className="muted">No one was caught. Impressive.</p>}
        <div className="stack">
          {chain.map((k) => (
            <div key={k.id} className="stack" style={{ gap: 2 }}>
              <p>
                <span className="muted mono small">{time(k.at)}</span> <strong>{k.killer}</strong> → {k.victim}
                {k.how && <span className="muted small"> ({k.how})</span>}
              </p>
              {k.story && <p className="muted small">“{k.story}”</p>}
            </div>
          ))}
        </div>
      </section>

      {(goodBets.length > 0 || leftEarly.length > 0) && (
        <section className="card">
          {goodBets.length > 0 && <p>🔮 Called it: {goodBets.join(", ")} bet on the winner.</p>}
          {leftEarly.length > 0 && <p className="muted small">Left early: {leftEarly.join(", ")}</p>}
        </section>
      )}
    </main>
  );
}
