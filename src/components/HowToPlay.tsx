// The illustrated rules: used on the /how page and on a player's page while
// they wait for the game to start.

import type { ReactNode } from "react";
import { AccuseArt, CatchArt, CheckInArt, GhostArt, LoopArt, TargetArt, WinArt } from "./illustrations";
import { COPY } from "@/lib/copy";

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
  ["⚡", "1 bonus action per game: guess your hunter or swap your task."],
  ["⏸️", "Embassy closed = game paused. No catching."],
  ["⚖️", "Afam settles every dispute."],
  ["🎟️", `Every catch = a drink ticket for ${COPY.drinks}. Get it from ${COPY.ticketHost}, until the tab's finished.`],
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
        title="Bonus actions"
        caption={
          <div className="stack small" style={{ gap: 6 }}>
            <p>
              There are <strong>2 bonus actions</strong>. You can use <strong>only 1</strong> per game.
            </p>
            <p>
              <strong>1. Guess who&apos;s hunting you.</strong> <span style={{ color: "var(--ok)" }}>Right:</span> they&apos;re out
              and it counts as your catch. <span style={{ color: "var(--danger)" }}>Wrong:</span> nothing happens.
            </p>
            <p>
              <strong>2. Swap your task</strong> for a new one.
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
