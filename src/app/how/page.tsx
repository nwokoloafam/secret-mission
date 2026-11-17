import Link from "next/link";
import { HowToPlaySteps } from "@/components/HowToPlay";
import { COPY } from "@/lib/copy";

export const metadata = { title: `How to play · ${COPY.gameName}` };

export default function HowToPlay() {
  return (
    <main className="page">
      <header className="stack" style={{ gap: 4, textAlign: "center" }}>
        <p className="eyebrow">{COPY.tagline}</p>
        <h1>How to play</h1>
        <p className="muted">A quiet game in the background of the party.</p>
      </header>

      <HowToPlaySteps />

      <Link href="/" className="btn primary" style={{ textDecoration: "none", textAlign: "center" }}>
        Back to the game
      </Link>
    </main>
  );
}
