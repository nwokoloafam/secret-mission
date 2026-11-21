"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  accuseAction,
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
import type { InboxNotification } from "@/lib/notifications";
import { Notifications } from "@/components/Notifications";
import { HowToPlaySteps } from "@/components/HowToPlay";
import { AutoRefresh, Avatar, Btn, Countdown, Flash, PhotoPicker, SaveLink, useAction } from "@/components/ui";

type Person = { id: string; firstName: string; photoUrl: string | null; kills?: number };

export interface PlayerViewData {
  token: string;
  me: {
    id: string;
    emailOptIn: boolean;
    email: string | null;
    firstName: string;
    photoUrl: string | null;
    status: string;
    code: string | null;
    bonusUsed: boolean;
    killCount: number;
    graceUntil: string | null;
    shieldUntil: string | null;
    topColor: string | null;
    accessory: string | null;
    outReason: string | null;
    outByName: string | null;
    betOnName: string | null;
    betOnPhoto: string | null;
    poltergeistUsed: boolean;
  };
  game: {
    id: string;
    status: string;
    targetEndAt: string | null;
    winnerName: string | null;
    settings: { bonusAt: number; barTabOpen: boolean; joinCutoff: number };
  };
  target: (Person & { how: string | null }) | null;
  mission: string | null;
  hints: { id: string; text: string; anonymous: boolean; at: string }[];
  aliveCount: number;
  outNames: string[];
  others: Person[];
  broadcast: string | null;
  notifications: InboxNotification[];
  notificationsEnabled: boolean;
  emailAvailable: boolean;
  emailPreview: boolean;
}

export function PlayerView({ data }: { data: PlayerViewData }) {
  const { me, game } = data;
  const unreadUpdates = data.notifications.filter((n) => !n.readAt).length;
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

      {data.notificationsEnabled && unreadUpdates > 0 && (
        <a className="banner" href="#inbox-heading">{unreadUpdates} new update{unreadUpdates === 1 ? "" : "s"} — view your updates</a>
      )}
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

      {me.status === "checked_in" && running && (
        <div className="card">
          <h3>You made it for the finale 🍿</h3>
          <p className="muted">
            The game is already down to its final {game.settings.joinCutoff} players, so new arrivals watch from the sidelines. You
            can still bet on the winner and send one anonymous tip.
          </p>
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

      <div className="card">
        <h3>Save your personal link</h3>
        <p className="muted small">Copy or save this link so you can return to your game page and see your latest updates.</p>
        <SaveLink token={data.token} />
      </div>
      {data.notificationsEnabled && <Notifications token={data.token} notifications={data.notifications} emailAvailable={data.emailAvailable} emailPreview={data.emailPreview} emailOptIn={me.emailOptIn} email={me.email} />}
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
          This page is your personal link to the game. Save it so you can get back in on party night.
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
      <p className="eyebrow" style={{ marginTop: 8 }}>
        While you wait: how to play
      </p>
      <HowToPlaySteps skipCheckIn />
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
  const [showCode, setShowCode] = useState(false);
  const kill = useAction();
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
                  if (r.ok) setCode("");
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

      <BonusMove data={data} />

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

function BonusMove({ data }: { data: PlayerViewData }) {
  const [mode, setMode] = useState<"choose" | "guess">("choose");
  const [pick, setPick] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const a = useAction();
  const paused = data.game.status === "paused";
  const pickName = data.others.find((o) => o.id === pick)?.firstName;

  if (data.me.bonusUsed) {
    return (
      <div className="card">
        <p className="eyebrow">⚡ Bonus action</p>
        <p className="muted small">You&apos;ve used your bonus action for this game.</p>
        <Flash result={a.result} />
      </div>
    );
  }

  return (
    <div className="card">
      <div>
        <p className="eyebrow">⚡ Bonus actions</p>
        <p className="muted small">2 options. You can use only 1 per game.</p>
      </div>
      {mode === "choose" ? (
        <div className="row wrap">
          <Btn kind="ghost" disabled={paused} onClick={() => setMode("guess")}>
            1. 🕵️ Guess my hunter
          </Btn>
          <Btn kind="ghost" pending={a.pending} disabled={paused} onClick={() => a.run(() => rerollAction(data.token))}>
            2. 🔄 Swap my task
          </Btn>
        </div>
      ) : (
        <>
          <p className="small">
            Who has <em>you</em> as their target? <span style={{ color: "var(--ok)" }}>Right:</span> they&apos;re out and it
            counts as your catch. <span style={{ color: "var(--danger)" }}>Wrong:</span> nothing happens, but your bonus action
            is gone.
          </p>
          <div className="photo-grid">
            {data.others.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`photo-pick ${pick === p.id ? "on" : ""}`}
                onClick={() => {
                  setPick(p.id);
                  setConfirming(false);
                }}
              >
                <Photo url={p.photoUrl} name={p.firstName} />
                <span>{p.firstName}</span>
              </button>
            ))}
          </div>
          <div className="row wrap">
            {pick &&
              (confirming ? (
                <Btn
                  kind="danger"
                  pending={a.pending}
                  disabled={paused}
                  onClick={() => a.run(() => accuseAction(data.token, pick), () => setConfirming(false))}
                >
                  Confirm: it&apos;s {pickName}
                </Btn>
              ) : (
                <Btn onClick={() => setConfirming(true)}>It&apos;s {pickName}</Btn>
              ))}
            <Btn
              kind="ghost"
              onClick={() => {
                setMode("choose");
                setPick(null);
                setConfirming(false);
              }}
            >
              Back
            </Btn>
          </div>
        </>
      )}
      <Flash result={a.result} />
    </div>
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

/** Square photo (or first initial if there's no photo). Fills its box unless a size is given. */
function Photo({ url, name, size }: { url: string | null; name: string; size?: number }) {
  const style = size ? { width: size, height: size, flex: "none" as const } : undefined;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="photo-sq" style={style} />;
  }
  return (
    <div className="photo-sq placeholder" style={style}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function GhostActions({ data }: { data: PlayerViewData }) {
  const [bet, setBet] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [text, setText] = useState("");
  const betA = useAction();
  const polt = useAction();
  const everyone = data.others;
  const ranked = [...everyone].sort((x, y) => (y.kills ?? 0) - (x.kills ?? 0) || x.firstName.localeCompare(y.firstName));
  return (
    <>
      <div className="card">
        <h3>📊 Who&apos;s winning</h3>
        <p className="muted small">Catches so far, for players still in. Only the ghosts can see this.</p>
        <div className="list">
          {ranked.map((p, i) => (
            <div key={p.id} className="row" style={{ gap: 10 }}>
              <span className="muted mono small" style={{ width: 18 }}>
                {i + 1}
              </span>
              <Avatar url={p.photoUrl} name={p.firstName} size={32} />
              <span style={{ flex: 1 }}>{p.firstName}</span>
              <span className="tag gold">
                {p.kills ?? 0} catch{p.kills === 1 ? "" : "es"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Betting pool</h3>
        {data.me.betOnName ? (
          <div className="row">
            <Photo url={data.me.betOnPhoto} name={data.me.betOnName} size={96} />
            <p className="muted">
              You bet on <strong style={{ color: "var(--ink)" }}>{data.me.betOnName}</strong>. Correct picks get a shout-out at
              the reveal.
            </p>
          </div>
        ) : (
          <>
            <p className="muted small">Who gets the green card? One pick.</p>
            <div className="photo-grid">
              {ranked.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`photo-pick ${bet === p.id ? "on" : ""}`}
                  onClick={() => setBet(p.id)}
                >
                  <Photo url={p.photoUrl} name={p.firstName} />
                  <span>{p.firstName}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {p.kills ?? 0} catch{p.kills === 1 ? "" : "es"}
                  </span>
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
      <summary>{missing ? "⚠️ Add your photo so your hunter can find you" : "Change your photo (one in tonight's outfit helps)"}</summary>
      <PhotoPicker
        onPick={(f) => {
          const fd = new FormData();
          fd.set("photo", f);
          a.run(() => updatePhoto(data.token, fd));
        }}
      />
      {a.pending && <p className="muted small">Uploading…</p>}
      <Flash result={a.result} />
    </details>
  );
}
