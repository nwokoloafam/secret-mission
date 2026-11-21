import Link from "next/link";
import { connection } from "next/server";
import { COPY } from "@/lib/copy";
import { currentGame } from "@/lib/db/queries";
import { emailAvailable, emailPreview } from "@/lib/notifications";
import { JoinForm } from "./JoinForm";

// The signup action's email work continues after the redirect response.
export const maxDuration = 300;

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
            Takes a minute.{" "}
            <Link href="/how">How the game works</Link>
          </p>
          <JoinForm emailAvailable={emailAvailable()} emailPreview={emailPreview()} />
        </>
      ) : (
        <p className="muted">Sign-ups aren&apos;t open yet.</p>
      )}
    </main>
  );
}
