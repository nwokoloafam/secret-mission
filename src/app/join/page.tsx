import Link from "next/link";
import { connection } from "next/server";
import { COPY } from "@/lib/copy";
import { currentGame } from "@/lib/db/queries";
import { JoinForm } from "./JoinForm";

export default async function JoinPage() {
  await connection();
  const game = await currentGame();
  return (
    <main className="page">
      <p className="eyebrow">{COPY.tagline}</p>
      <h1>Visa application</h1>
      {game ? (
        <>
          <p className="muted">
            Takes a minute. Use a clear photo of your face so your hunter can find you at the party.{" "}
            <Link href="/how">How the game works</Link>
          </p>
          <JoinForm />
        </>
      ) : (
        <p className="muted">Sign-ups aren&apos;t open yet.</p>
      )}
    </main>
  );
}
