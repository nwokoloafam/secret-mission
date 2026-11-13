import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { COPY } from "@/lib/copy";
import { currentGame, playerByToken } from "@/lib/db/queries";

export default async function Home() {
  await connection();
  const token = (await cookies()).get("sm_token")?.value;
  if (token && (await playerByToken(token).catch(() => null))) redirect(`/p/${token}`);

  const game = await currentGame().catch(() => null);

  return (
    <main className="page" style={{ minHeight: "100dvh", alignContent: "center", textAlign: "center" }}>
      <p className="eyebrow">{COPY.tagline}</p>
      <h1 style={{ fontSize: 40 }}>{COPY.gameName}</h1>
      {game ? (
        <>
          <p className="muted">
            Every guest gets a secret target and a sneaky social task. Complete it, collect their {COPY.code}, and take
            over their case. Last one standing gets the {COPY.winner.toLowerCase()}.
          </p>
          <Link href="/join" className="btn primary" style={{ textDecoration: "none", justifySelf: "center" }}>
            Apply now
          </Link>
          <Link href="/how" style={{ justifySelf: "center" }}>
            How to play
          </Link>
          <p className="muted small">Already applied? Open the personal link you got when you signed up.</p>
        </>
      ) : (
        <p className="muted">Your application is being processed. Check back closer to the party.</p>
      )}
    </main>
  );
}
