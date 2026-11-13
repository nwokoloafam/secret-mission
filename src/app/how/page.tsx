import Link from "next/link";
import type { ReactNode } from "react";
import { AccuseArt, CatchArt, CheckInArt, GhostArt, LoopArt, TargetArt, WinArt } from "@/components/illustrations";
import { COPY } from "@/lib/copy";

export const metadata = { title: `How to play · ${COPY.gameName}` };

function Step({ n, title, caption, children }: { n: number; title: string; caption: string; children: ReactNode }) {
  return (
    <section className="card" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 10 }}>
        <span className="step-num">{n}</span>
        <h2 style={{ fontSize: 18 }}>{title}</h2>
      </div>
      {children}
      <p className="muted small" style={{ textAlign: "center" }}>
        {caption}
      </p>
    </section>
  );
}

const RULES: [string, string][] = [
  ["🤝", "Caught? Hand over your code. No arguing."],
  ["🙅", "Guests only. No bar staff or strangers."],
  ["🔄", "One task swap if yours is too awkward."],
  ["⏸️", "Embassy closed = game paused. No catching."],
  ["⚖️", "Afam settles every dispute."],
  ["🍺", "Every catch = a beer, shot, or mocktail on Afam's tab, until it's finished. Honor system!"],
];

export default function HowToPlay() {
  return (
    <main className="page">
      <header className="stack" style={{ gap: 4, textAlign: "center" }}>
        <p className="eyebrow">{COPY.tagline}</p>
        <h1>How to play</h1>
        <p className="muted">A quiet game in the background of the party.</p>
      </header>

      <Step n={1} title="Apply & check in" caption="Sign up with a clear face photo. At the party, tap “I’m here”.">
        <CheckInArt />
      </Step>
      <Step n={2} title="Get your case file" caption="Your phone shows who to find and a sneaky task.">
        <TargetArt />
      </Step>
      <Step n={3} title="Deny their visa" caption="Do the task, say “got you”, and type in their 4-digit stamp.">
        <CatchArt />
      </Step>
      <Step n={4} title="Take over their case" caption="Everyone hunts the next person. Catch yours and their target is yours.">
        <LoopArt />
      </Step>
      <Step n={5} title="Watch your back" caption="Someone is hunting you. One guess per game (+1 at 3 catches).">
        <AccuseArt />
      </Step>
      <Step n={6} title="Out? Haunt them" caption="Ghosts can bet on the winner and send one anonymous tip.">
        <GhostArt />
      </Step>
      <Step n={7} title="Win the green card" caption="Last one standing, or most catches when time runs out.">
        <WinArt />
      </Step>

      <section className="card">
        <h2 style={{ fontSize: 18 }}>House rules</h2>
        <div className="rules-grid">
          {RULES.map(([icon, text]) => (
            <div key={text} className="rule">
              <span className="rule-icon">{icon}</span>
              <span className="small">{text}</span>
            </div>
          ))}
        </div>
      </section>

      <Link href="/" className="btn primary" style={{ textDecoration: "none", textAlign: "center" }}>
        Back to the game
      </Link>
    </main>
  );
}
