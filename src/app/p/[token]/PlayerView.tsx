"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  accuseAction,
  addKillStoryAction,
  betAction,
  cantFindAction,
  checkInAction,
  disputeAction,
  leaveAction,
  poltergeistAction,
  rerollAction,
  submitKillAction,
  tickAction,
  updateOutfit,
  updatePhoto,
} from "@/app/actions";
import { ACCESSORIES, COPY, TOP_COLORS } from "@/lib/copy";
import { AutoRefresh, Avatar, Btn, Countdown, Flash, shrinkImage, useAction } from "@/components/ui";

type Person = { id: string; firstName: string; photoUrl: string | null };

export interface PlayerViewData {
  token: string;
  me: {
    id: string;
    firstName: string;
    photoUrl: string | null;
    status: string;
    code: string | null;
    rerollsLeft: number;
    accusationsLeft: number;
    bonusEarned: boolean;
    killCount: number;
    graceUntil: string | null;
    shieldUntil: string | null;
    topColor: string | null;
    accessory: string | null;
    outReason: string | null;
    outByName: string | null;
    betOnName: string | null;
    poltergeistUsed: boolean;
  };
  game: {
    id: string;
    status: string;
    targetEndAt: string | null;
    winnerName: string | null;
    settings: { bonusAt: number; barTabOpen: boolean };
  };
  target: (Person & { how: string | null }) | null;
  mission: string | null;
  hints: { id: string; text: string; anonymous: boolean; at: string }[];
  aliveCount: number;
  outNames: string[];
  others: Person[];
  broadcast: string | null;
}

export function PlayerView({ data }: { data: PlayerViewData }) {
  const { me, game } = data;
  const tick = useCallback(() => tickAction(game.id), [game.id]);
  const paused = game.status === "paused";
  const running = game.status === "active" || paused;
  const ghost = running && (me.status === "eliminated" || (me.status === "checked_in" && game.status !== "setup"));

  return (
    <main className="page">
      <AutoRefresh seconds={8} onTick={tick} tickEvery={120} />

      <header className="row spread">
        <div className="stack" style={{ gap: 2 }}>
          <p className="eyebrow">{COPY.gameName}</p>
          <h2>{me.firstName}</h2>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link href="/how" className="help-link">
            How to play
          </Link>
          <Avatar url={me.photoUrl} name={me.firstName} size={52} />
        </div>
      </header>

      {paused && <p className="banner warn">{COPY.paused}</p>}
      {data.broadcast && <p className="banner">📣 {data.broadcast}</p>}
      {running && !game.settings.barTabOpen && (
        <p className="banner">🍺 The bar tab is finished! Catches still count, drinks are on you now.</p>
      )}

      {running && (
        <div className="row spread small muted">
          <span>{COPY.remaining(data.aliveCount)}</span>
          {game.targetEndAt && (
            <span>
              Ends in <Countdown to={game.targetEndAt} frozen={paused} />
            </span>
          )}
        </div>
      )}

      {game.status === "ended" ? (
        <Ended data={data} />
      ) : me.status === "registered" ? (
        <NotHereYet data={data} />
      ) : me.status === "checked_in" && game.status === "setup" ? (
        <Waiting data={data} />
      ) : me.status === "queued" ? (
        <div className="card">
          <h3>You&apos;re in the queue</h3>
          <p className="muted">
            You&apos;ll be added to the game at the next elimination, or within a few minutes. Keep this page open.
          </p>
        </div>
      ) : me.status === "alive" ? (
        <Alive data={data} />
      ) : me.status === "left" ? (
        <div className="card">
          <h3>You&apos;ve left the game</h3>
          <p className="muted">Thanks for playing! Check back for the final reveal.</p>
        </div>
      ) : null}

      {me.status === "eliminated" && game.status !== "ended" && (
        <div className="card">
          <p className="eyebrow">{COPY.eliminated}</p>
          <h3>{me.outByName ? `${me.outByName} got you.` : "You're out."}</h3>
          <p className="muted">You&apos;re a ghost now — you can still meddle.</p>
        </div>
      )}

      {ghost && <GhostActions data={data} />}

      {running && data.outNames.length > 0 && (
        <details className="card">
          <summary>
            {COPY.eliminated} ({data.outNames.length})
          </summary>
          <p className="muted small">{data.outNames.join(", ")}</p>
        </details>
      )}

      <PhotoUpdate data={data} />
    </main>
  );
}

// ─────────────────────────────────────────────

function NotHereYet({ data }: { data: PlayerViewData }) {
  const [color, setColor] = useState(data.me.topColor ?? "");
  const [acc, setAcc] = useState(data.me.accessory ?? "");
  const a = useAction();
  return (
    <>
      <div className="card highlight">
        <h3>You&apos;re signed up 🎉</h3>
        <p className="muted">
          <strong>Bookmark this page</strong> or add it to your home screen. It&apos;s your personal link for the
          game.
        </p>
      </div>
      <div className="card">
        <h3>At the party? Check in</h3>
        <p className="muted small">Two quick taps about tonight&apos;s outfit (used for hints).</p>
        <OutfitPicker color={color} setColor={setColor} acc={acc} setAcc={setAcc} />
        <Btn pending={a.pending} onClick={() => a.run(() => checkInAction(data.token, color, acc))}>
          I&apos;m here
        </Btn>
        <Flash result={a.result} />
      </div>
    </>
  );
}

function Waiting({ data }: { data: PlayerViewData }) {
  const [color, setColor] = useState(data.me.topColor ?? "");
  const [acc, setAcc] = useState(data.me.accessory ?? "");
  const a = useAction();
  return (
    <>
      <div className="card highlight">
        <h3>You&apos;re checked in ✅</h3>
        <p className="muted">Waiting for {COPY.host} to start the game. This page updates on its own.</p>
      </div>
      <details className="card">
        <summary>Update your outfit</summary>
        <OutfitPicker color={color} setColor={setColor} acc={acc} setAcc={setAcc} />
        <Btn kind="ghost" pending={a.pending} onClick={() => a.run(() => updateOutfit(data.token, color, acc))}>
          Save
        </Btn>
        <Flash result={a.result} />
      </details>
    </>
  );
}

function OutfitPicker({
  color,
  setColor,
  acc,
  setAcc,
}: {
  color: string;
  setColor: (v: string) => void;
  acc: string;
  setAcc: (v: string) => void;
}) {
  return (
    <div className="stack">
      <span className="muted small">Main color of your top</span>
      <div className="chips">
        {TOP_COLORS.map((c) => (
          <button key={c} type="button" className={`chip ${color === c ? "on" : ""}`} onClick={() => setColor(c)}>
            {c}
          </button>
        ))}
      </div>
      <span className="muted small">Wearing any of these?</span>
      <div className="chips">
        {ACCESSORIES.map((c) => (
          <button key={c} type="button" className={`chip ${acc === c ? "on" : ""}`} onClick={() => setAcc(c)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────

function Alive({ data }: { data: PlayerViewData }) {
  const { me, target } = data;
  const paused = data.game.status === "paused";
  const [code, setCode] = useState("");
  const [lastVictim, setLastVictim] = useState<string | null>(null);
  const [story, setStory] = useState("");
  const [showCode, setShowCode] = useState(false);
  const kill = useAction();
  const storyA = useAction();
  const reroll = useAction();
  const misc = useAction();

  return (
    <>
      {me.graceUntil && (
        <p className="banner">
          🛡️ You can&apos;t be caught for <Countdown to={me.graceUntil} frozen={paused} /> (just arrived)
        </p>
      )}
      {me.shieldUntil && (
        <p className="banner">
          🛡️ Shielded for <Countdown to={me.shieldUntil} frozen={paused} />
        </p>
      )}

      {lastVictim && (
        <div className="card highlight">
          <h3>Nice work. Tell the story?</h3>
          <p className="muted small">One line, read out at the end reveal.</p>
          <input value={story} onChange={(e) => setStory(e.target.value)} maxLength={280} placeholder="How'd you do it?" />
          <div className="row">
            <Btn
              pending={storyA.pending}
              onClick={() =>
                storyA.run(
                  () => addKillStoryAction(data.token, lastVictim, story),
                  (r) => r.ok && setLastVictim(null),
                )
              }
            >
              Save story
            </Btn>
            <Btn kind="ghost" onClick={() => setLastVictim(null)}>
              Skip
            </Btn>
          </div>
          <Flash result={storyA.result} />
        </div>
      )}
      {!lastVictim && storyA.result?.ok && <Flash result={storyA.result} />}

      {target ? (
        <div className="card highlight">
          <p className="eyebrow">Your {COPY.target}</p>
          {target.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={target.photoUrl} alt={target.firstName} className="target-photo" />
          ) : (
            <div className="target-photo" style={{ display: "grid", placeItems: "center" }}>
              <span className="muted">No photo yet</span>
            </div>
          )}
          <div>
            <h2>{target.firstName}</h2>
            {target.how && <p className="muted">Knows Afam from: {target.how}</p>}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <p className="eyebrow">Your {COPY.mission}</p>
            <p style={{ fontSize: 18 }}>{data.mission ?? "—"}</p>
          </div>
          {data.hints.filter((h) => !h.anonymous).length > 0 && (
            <div className="stack" style={{ gap: 4 }}>
              <p className="eyebrow">Intel on your target</p>
              {data.hints
                .filter((h) => !h.anonymous)
                .map((h) => (
                  <p key={h.id} className="small">
                    🔎 {h.text}
                  </p>
                ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <p className="muted">You have no target right now.</p>
        </div>
      )}

      {target && (
        <div className="card">
          <h3>Mission done?</h3>
          <p className="muted small">Tell them &quot;got you&quot; and ask for their 4-digit {COPY.code}.</p>
          <input
            className="code-input"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="0000"
          />
          <Btn
            pending={kill.pending}
            disabled={code.length !== 4 || paused}
            onClick={() =>
              kill.run(
                () => submitKillAction(data.token, code),
                (r) => {
                  if (r.ok) {
                    setCode("");
                    setLastVictim((r.data?.victimId as string) ?? null);
                    setStory("");
                  }
                },
              )
            }
          >
            Deny their visa
          </Btn>
          <Flash result={kill.result} />
        </div>
      )}

      <div className="card">
        <div className="row spread">
          <div>
            <p className="eyebrow">Your {COPY.code}</p>
            <p className="muted small">Hand it over if you get caught.</p>
          </div>
          {showCode ? (
            <button className="big-code" style={{ background: "none", border: 0 }} onClick={() => setShowCode(false)}>
              {me.code}
            </button>
          ) : (
            <Btn kind="small" onClick={() => setShowCode(true)}>
              Show
            </Btn>
          )}
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <h3>Task too awkward?</h3>
          <Btn
            kind="small"
            pending={reroll.pending}
            disabled={me.rerollsLeft <= 0 || paused}
            onClick={() => reroll.run(() => rerollAction(data.token))}
          >
            {me.rerollsLeft > 0 ? "Swap task (1 left)" : "No swaps left"}
          </Btn>
        </div>
        <Flash result={reroll.result} />
      </div>

      <Accuse data={data} />

      {data.hints.filter((h) => h.anonymous).length > 0 && (
        <div className="card">
          <p className="eyebrow">Anonymous tips 👻</p>
          {data.hints
            .filter((h) => h.anonymous)
            .map((h) => (
              <p key={h.id} className="small">
                “{h.text}”
              </p>
            ))}
          <p className="muted small">From a ghost. Could be true. Could be a trap.</p>
        </div>
      )}

      <details className="card">
        <summary>Problems?</summary>
        <Btn kind="ghost" pending={misc.pending} onClick={() => misc.run(() => cantFindAction(data.token))}>
          Can&apos;t find my target
        </Btn>
        <Dispute token={data.token} />
        <Leave token={data.token} />
        <Flash result={misc.result} />
      </details>
    </>
  );
}

function Accuse({ data }: { data: PlayerViewData }) {
  const [pick, setPick] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const a = useAction();
  const left = data.me.accusationsLeft;
  const paused = data.game.status === "paused";
  return (
    <details className="card">
      <summary>Think you know who&apos;s hunting you? ({left} accusation{left === 1 ? "" : "s"} left)</summary>
      <p className="muted small">
        Right: they&apos;re out, it counts as a kill, and you&apos;re shielded for 10 minutes. Wrong: your hunter gets a
        clue about you. {!data.me.bonusEarned && `You earn a bonus accusation at ${data.game.settings.bonusAt} kills.`}
      </p>
      {left > 0 && (
        <>
          <div className="list">
            {data.others.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pick ${pick === p.id ? "on" : ""}`}
                onClick={() => {
                  setPick(p.id);
                  setConfirming(false);
                }}
              >
                <Avatar url={p.photoUrl} name={p.firstName} size={36} />
                {p.firstName}
              </button>
            ))}
          </div>
          {pick &&
            (confirming ? (
              <Btn
                kind="danger"
                pending={a.pending}
                disabled={paused}
                onClick={() =>
                  a.run(
                    () => accuseAction(data.token, pick),
                    () => {
                      setPick(null);
                      setConfirming(false);
                    },
                  )
                }
              >
                Confirm: accuse {data.others.find((o) => o.id === pick)?.firstName}
              </Btn>
            ) : (
              <Btn kind="ghost" onClick={() => setConfirming(true)}>
                Accuse {data.others.find((o) => o.id === pick)?.firstName}
              </Btn>
            ))}
        </>
      )}
      <Flash result={a.result} />
    </details>
  );
}

function Dispute({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const a = useAction();
  if (!open)
    return (
      <Btn kind="ghost" onClick={() => setOpen(true)}>
        My target won&apos;t hand over their code
      </Btn>
    );
  return (
    <div className="stack">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? (optional)" maxLength={200} />
      <Btn kind="ghost" pending={a.pending} onClick={() => a.run(() => disputeAction(token, note), (r) => r.ok && setOpen(false))}>
        Send to Afam
      </Btn>
      <Flash result={a.result} />
    </div>
  );
}

function Leave({ token }: { token: string }) {
  const [confirm, setConfirm] = useState(false);
  const a = useAction();
  return (
    <>
      <Btn kind="danger" pending={a.pending} onClick={() => (confirm ? a.run(() => leaveAction(token)) : setConfirm(true))}>
        {confirm ? "Tap again to leave the game" : "I'm leaving the party"}
      </Btn>
      <Flash result={a.result} />
    </>
  );
}

// ─────────────────────────────────────────────

function GhostActions({ data }: { data: PlayerViewData }) {
  const [bet, setBet] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [text, setText] = useState("");
  const betA = useAction();
  const polt = useAction();
  const everyone = data.others;
  return (
    <>
      <div className="card">
        <h3>Betting pool</h3>
        {data.me.betOnName ? (
          <p className="muted">You bet on {data.me.betOnName}. Correct picks get a shout-out at the reveal.</p>
        ) : (
          <>
            <p className="muted small">Who gets the green card? One pick.</p>
            <div className="list">
              {everyone.map((p) => (
                <button key={p.id} type="button" className={`pick ${bet === p.id ? "on" : ""}`} onClick={() => setBet(p.id)}>
                  <Avatar url={p.photoUrl} name={p.firstName} size={32} />
                  {p.firstName}
                </button>
              ))}
            </div>
            {bet && (
              <Btn pending={betA.pending} onClick={() => betA.run(() => betAction(data.token, bet))}>
                Lock in my bet
              </Btn>
            )}
          </>
        )}
        <Flash result={betA.result} />
      </div>

      {data.game.status === "active" && (
        <div className="card">
          <h3>Poltergeist 👻</h3>
          {data.me.poltergeistUsed ? (
            <p className="muted">You&apos;ve sent your one anonymous tip.</p>
          ) : (
            <>
              <p className="muted small">Send one anonymous tip to any player. True or a red herring — your call.</p>
              <select value={to ?? ""} onChange={(e) => setTo(e.target.value || null)}>
                <option value="">Choose a player…</option>
                {everyone.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName}
                  </option>
                ))}
              </select>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={140} placeholder="Watch the person by the bar…" />
              <Btn
                pending={polt.pending}
                disabled={!to || !text.trim()}
                onClick={() => to && polt.run(() => poltergeistAction(data.token, to, text))}
              >
                Send anonymously
              </Btn>
            </>
          )}
          <Flash result={polt.result} />
        </div>
      )}
    </>
  );
}

function Ended({ data }: { data: PlayerViewData }) {
  return (
    <div className="card highlight" style={{ textAlign: "center" }}>
      <p className="eyebrow">{COPY.endReveal}</p>
      <h2>{data.game.winnerName ? `🏆 ${data.game.winnerName} gets the green card` : "Game over"}</h2>
      <Link href={`/reveal/${data.game.id}`} className="btn primary" style={{ textDecoration: "none" }}>
        See the full reveal
      </Link>
    </div>
  );
}

function PhotoUpdate({ data }: { data: PlayerViewData }) {
  const a = useAction();
  const missing = !data.me.photoUrl;
  return (
    <details className="card" open={missing && data.game.status !== "ended"}>
      <summary>{missing ? "⚠️ Add your photo so your hunter can find you" : "Update your photo"}</summary>
      <input
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const small = await shrinkImage(f);
          const fd = new FormData();
          fd.set("photo", small);
          a.run(() => updatePhoto(data.token, fd));
        }}
      />
      {a.pending && <p className="muted small">Uploading…</p>}
      <Flash result={a.result} />
    </details>
  );
}
