// The illustrated rules: used on the /how page and on a player's page while
// they wait for the game to start.

import type { ReactNode } from "react";
import { AccuseArt, CatchArt, CheckInArt, GhostArt, LoopArt, TargetArt, WinArt } from "./illustrations";

function Step({ n, title, caption, children }: { n: number; title: string; caption: ReactNode; children: ReactNode }) {
  return (
    <section className="card" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 10 }}>
        <span className="step-num">{n}</span>
        <h2 style={{ fontSize: 18 }}>{title}</h2>
      </div>
      {children}
      {typeof caption === "string" ? (
        <p className="muted small" style={{ textAlign: "center" }}>
          {caption}
        </p>
      ) : (
        caption
      )}
    </section>
  );
}

const RULES: [string, string][] = [
  ["🤝", "Caught? Hand over your code. No arguing."],
  ["🙅", "Guests only. No bar staff or strangers."],
  ["⚡", "One bonus move: swap your task or guess your hunter."],
  ["⏸️", "Embassy closed = game paused. No catching."],
  ["⚖️", "Afam settles every dispute."],
  ["🍺", "Every catch = a beer, shot, or mocktail on Afam's tab, until it's finished. Honor system!"],
];

export function HowToPlaySteps({ skipCheckIn = false }: { skipCheckIn?: boolean }) {
  const n = (i: number) => (skipCheckIn ? i - 1 : i);
  return (
    <>
      {!skipCheckIn && (
        <Step n={1} title="Apply & check in" caption="Sign up with a clear face photo. At the party, tap “I’m here”.">
          <CheckInArt />
        </Step>
      )}
      <Step n={n(2)} title="Get your case file" caption="Your phone shows who to find and a sneaky task.">
        <TargetArt />
      </Step>
      <Step n={n(3)} title="Deny their visa" caption="Do the task, say “got you”, and type in their 4-digit stamp.">
        <CatchArt />
      </Step>
      <Step n={n(4)} title="Take over their case" caption="Everyone hunts the next person. Catch yours and their target is yours.">
        <LoopArt />
      </Step>
      <Step
        n={n(5)}
        title="Guess who's hunting you"
        caption={
          <div className="stack small" style={{ gap: 6 }}>
            <p className="muted">
              Someone has <em>you</em> as their target, and they know who you are. You don&apos;t know who they are. Think
              you&apos;ve spotted them? Guess in the app.
            </p>
            <p>
              <span style={{ color: "var(--ok)" }}>✓ Right:</span> they&apos;re out, and it counts as your catch.
            </p>
            <p>
              <span style={{ color: "var(--danger)" }}>✗ Wrong:</span> nothing happens, but you&apos;ve used your bonus move.
            </p>
            <p className="muted">
              ⚡ Everyone gets <strong>one bonus move</strong> per game: swap your task <em>or</em> guess your hunter.
            </p>
          </div>
        }
      >
        <AccuseArt />
      </Step>
      <Step n={n(6)} title="Out? Haunt them" caption="Ghosts can bet on the winner and send one anonymous tip.">
        <GhostArt />
      </Step>
      <Step n={n(7)} title="Win the green card" caption="Last one standing, or most catches when time runs out.">
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
    </>
  );
}
