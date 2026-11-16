"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  hostAddMission,
  hostAddWalkIn,
  hostBroadcast,
  hostCheckIn,
  hostEditMission,
  hostEnd,
  hostMove,
  hostPause,
  hostPlayAgain,
  hostRemove,
  hostResolveDispute,
  hostResume,
  hostSendHint,
  hostSetCustomHint,
  hostSetBarTab,
  hostSetWinner,
  hostShiftEnd,
  hostSkip,
  hostStart,
  hostTick,
  hostToggleMission,
} from "@/app/actions";
import { COPY } from "@/lib/copy";
import { AutoRefresh, Avatar, Btn, Countdown, Flash, useAction } from "@/components/ui";

type AdminPlayer = {
  id: string;
  token: string;
  firstName: string;
  photoUrl: string | null;
  how: string | null;
  status: string;
  kills: number;
  targetName: string | null;
  mission: string | null;
  customHint: string | null;
  outfit: string;
};

export interface AdminData {
  token: string;
  game: { id: string; name: string; status: string; targetEndAt: string | null; winnerId: string | null; defaultDuration: number; barTabOpen: boolean };
  players: AdminPlayer[];
  disputes: { id: string; text: string }[];
  alerts: { id: string; text: string; at: string }[];
  feed: { id: string; text: string; at: string }[];
  missions: { id: string; text: string; difficulty: "E" | "M" | "H"; active: boolean }[];
  counts: { alive: number; checkedIn: number; registered: number; queued: number };
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function AdminView({ data }: { data: AdminData }) {
  const t = data.token;
  const tick = useCallback(() => hostTick(t), [t]);
  const g = data.game;
  return (
    <main className="page wide">
      <AutoRefresh seconds={5} onTick={tick} tickEvery={30} />
      <header className="stack" style={{ gap: 4 }}>
        <p className="eyebrow">Host controls · {g.name}</p>
        <h1>{COPY.gameName}</h1>
        <p className="muted small">Keep this page open during the game: it runs the timers. Don&apos;t share this link.</p>
      </header>

      <Controls data={data} />
      {(data.disputes.length > 0 || data.alerts.length > 0) && <Alerts data={data} />}
      {g.status !== "ended" && <BarTab token={t} open={g.barTabOpen} />}
      <Broadcast token={t} />
      <Players data={data} />
      <WalkIn token={t} />
      <Missions data={data} />
      <Feed data={data} />
    </main>
  );
}

function Controls({ data }: { data: AdminData }) {
  const g = data.game;
  const t = data.token;
  const [mins, setMins] = useState(String(g.defaultDuration));
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmAgain, setConfirmAgain] = useState(false);
  const a = useAction();
  const c = data.counts;
  return (
    <section className="card highlight">
      <div className="row spread wrap">
        <div>
          <p className="eyebrow">Status</p>
          <h2 style={{ textTransform: "capitalize" }}>{g.status === "setup" ? "Not started" : g.status}</h2>
        </div>
        {(g.status === "active" || g.status === "paused") && g.targetEndAt && (
          <div style={{ textAlign: "right" }}>
            <p className="eyebrow">Ends in</p>
            <h2>
              <Countdown to={g.targetEndAt} frozen={g.status === "paused"} />
            </h2>
          </div>
        )}
      </div>
      <p className="muted small">
        {g.status === "setup"
          ? `${c.checkedIn} checked in · ${c.registered} signed up but not here yet`
          : `${c.alive} alive · ${c.queued} queued`}
      </p>

      {g.status === "setup" && (
        <div className="row wrap">
          <label style={{ width: 140 }}>
            Length (minutes)
            <input inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} />
          </label>
          <Btn pending={a.pending} disabled={c.checkedIn < 3} onClick={() => a.run(() => hostStart(t, Number(mins)))}>
            Start game ({c.checkedIn} players)
          </Btn>
        </div>
      )}

      {(g.status === "active" || g.status === "paused") && (
        <div className="row wrap">
          {g.status === "active" ? (
            <Btn pending={a.pending} onClick={() => a.run(() => hostPause(t))}>
              Pause
            </Btn>
          ) : (
            <Btn pending={a.pending} onClick={() => a.run(() => hostResume(t))}>
              Resume
            </Btn>
          )}
          <Btn kind="ghost" pending={a.pending} onClick={() => a.run(() => hostShiftEnd(t, 15))}>
            +15 min
          </Btn>
          <Btn kind="ghost" pending={a.pending} onClick={() => a.run(() => hostShiftEnd(t, -15))}>
            −15 min
          </Btn>
          <Btn
            kind="danger"
            pending={a.pending}
            onClick={() => (confirmEnd ? a.run(() => hostEnd(t), () => setConfirmEnd(false)) : setConfirmEnd(true))}
          >
            {confirmEnd ? "Tap again to end the game" : "End game now"}
          </Btn>
        </div>
      )}

      {g.status === "ended" && (
        <div className="stack">
          <Link href={`/reveal/${g.id}`} className="btn primary" style={{ textDecoration: "none", textAlign: "center" }}>
            Open the reveal (good for the TV)
          </Link>
          <Btn
            kind="ghost"
            pending={a.pending}
            onClick={() => (confirmAgain ? a.run(() => hostPlayAgain(t), () => setConfirmAgain(false)) : setConfirmAgain(true))}
          >
            {confirmAgain ? "Tap again: new round, same players" : "🔁 Play again with the same players"}
          </Btn>
          {confirmAgain && (
            <p className="muted small">
              Clears this round&apos;s targets, kills and reveal. Everyone keeps their link and is checked back in. People who left stay out.
            </p>
          )}
          {!g.winnerId && (
            <>
              <p className="muted small">No one had any kills, so pick the winner:</p>
              <div className="chips">
                {data.players
                  .filter((p) => p.status === "alive")
                  .map((p) => (
                    <button key={p.id} className="chip" onClick={() => a.run(() => hostSetWinner(t, p.id))}>
                      {p.firstName}
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
      <Flash result={a.result} />
    </section>
  );
}

function Alerts({ data }: { data: AdminData }) {
  const a = useAction();
  return (
    <section className="card" style={{ borderColor: "var(--danger)" }}>
      <h3>Needs you</h3>
      {data.disputes.map((d) => (
        <div key={d.id} className="stack">
          <p>⚖️ {d.text}</p>
          <div className="row">
            <Btn kind="small" pending={a.pending} onClick={() => a.run(() => hostResolveDispute(data.token, d.id, true))}>
              Uphold (count the kill)
            </Btn>
            <Btn kind="small" pending={a.pending} onClick={() => a.run(() => hostResolveDispute(data.token, d.id, false))}>
              Reject
            </Btn>
          </div>
        </div>
      ))}
      {data.alerts.map((al) => (
        <p key={al.id} className="small">
          <span className="muted">{time(al.at)}</span> {al.text}
        </p>
      ))}
      <Flash result={a.result} />
    </section>
  );
}

function BarTab({ token, open }: { token: string; open: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const a = useAction();
  return (
    <section className="card">
      <div className="row spread wrap">
        <div>
          <h3>🍺 Bar tab: {open ? "open" : "closed"}</h3>
          <p className="muted small">
            {open ? "Each catch earns a beer, shot, or mocktail (honor system)." : "Players see that catches no longer earn drinks."}
          </p>
        </div>
        {open ? (
          <Btn
            kind="danger"
            pending={a.pending}
            onClick={() => (confirm ? a.run(() => hostSetBarTab(token, false), () => setConfirm(false)) : setConfirm(true))}
          >
            {confirm ? "Tap again: tab is finished" : "Close the tab"}
          </Btn>
        ) : (
          <Btn kind="ghost" pending={a.pending} onClick={() => a.run(() => hostSetBarTab(token, true))}>
            Reopen
          </Btn>
        )}
      </div>
      <Flash result={a.result} />
    </section>
  );
}

function Broadcast({ token }: { token: string }) {
  const [text, setText] = useState("");
  const a = useAction();
  return (
    <details className="card">
      <summary>📣 Message everyone</summary>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Cake in 10 — game paused" />
      <Btn pending={a.pending} onClick={() => a.run(() => hostBroadcast(token, text), (r) => r.ok && setText(""))}>
        Send
      </Btn>
      <p className="muted small">Shows at the top of everyone&apos;s page for 20 minutes.</p>
      <Flash result={a.result} />
    </details>
  );
}

function Players({ data }: { data: AdminData }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card">
      <h3>Players ({data.players.length})</h3>
      <p className="muted small">Alive players are listed in loop order: each one hunts the next.</p>
      <div className="list">
        {data.players.map((p) => (
          <div key={p.id} className="stack" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
            <button className="pick" style={{ border: 0, padding: 0 }} onClick={() => setOpen(open === p.id ? null : p.id)}>
              <Avatar url={p.photoUrl} name={p.firstName} size={36} />
              <span style={{ flex: 1 }}>
                <strong>{p.firstName}</strong>{" "}
                <span className={`tag ${p.status === "alive" ? "alive" : ["eliminated", "left"].includes(p.status) ? "out" : ""}`}>
                  {p.status.replace("_", " ")}
                </span>
                {p.kills > 0 && <span className="tag gold"> {p.kills} kill{p.kills === 1 ? "" : "s"}</span>}
                {p.targetName && <span className="muted small"> → {p.targetName}</span>}
              </span>
            </button>
            {open === p.id && <PlayerActions data={data} p={p} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function PlayerActions({ data, p }: { data: AdminData; p: AdminPlayer }) {
  const t = data.token;
  const [hint, setHint] = useState(p.customHint ?? "");
  const [away, setAway] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const a = useAction();
  const alive = p.status === "alive";
  const link = typeof window !== "undefined" ? `${window.location.origin}/p/${p.token}` : `/p/${p.token}`;
  return (
    <div className="stack" style={{ paddingLeft: 46 }}>
      {p.how && <p className="muted small">Knows Afam from: {p.how}</p>}
      {p.outfit && <p className="muted small">Outfit: {p.outfit}</p>}
      {p.mission && <p className="small">Task: {p.mission}</p>}
      <p className="muted small">
        Personal link: <a href={link}>{link}</a>
      </p>

      <div className="row wrap">
        {p.status === "registered" && (
          <Btn kind="small" pending={a.pending} onClick={() => a.run(() => hostCheckIn(t, p.id))}>
            Check them in
          </Btn>
        )}
        {alive && (
          <Btn kind="small" pending={a.pending} onClick={() => a.run(() => hostSkip(t, p.id))}>
            Skip their task
          </Btn>
        )}
        {!["eliminated", "left"].includes(p.status) && (
          <Btn
            kind="small"
            pending={a.pending}
            onClick={() => (confirmRemove ? a.run(() => hostRemove(t, p.id)) : setConfirmRemove(true))}
          >
            {confirmRemove ? "Tap again to remove" : "Remove (left)"}
          </Btn>
        )}
      </div>

      {alive && (
        <div className="row wrap">
          <select value={away} onChange={(e) => setAway(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">Move… keep away from (optional)</option>
            {data.players
              .filter((o) => o.status === "alive" && o.id !== p.id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.firstName}
                </option>
              ))}
          </select>
          <Btn kind="small" pending={a.pending} onClick={() => a.run(() => hostMove(t, p.id, away || null))}>
            Move in the loop
          </Btn>
        </div>
      )}

      <div className="row wrap">
        <input value={hint} onChange={(e) => setHint(e.target.value)} maxLength={140} placeholder="Custom hint about them" style={{ flex: 1, minWidth: 180 }} />
        <Btn kind="small" pending={a.pending} onClick={() => a.run(() => hostSetCustomHint(t, p.id, hint))}>
          Save hint
        </Btn>
        {alive && (
          <Btn kind="small" pending={a.pending} disabled={!hint.trim()} onClick={() => a.run(() => hostSendHint(t, p.id, hint))}>
            Send to their hunter
          </Btn>
        )}
      </div>
      <Flash result={a.result} />
    </div>
  );
}

function WalkIn({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [how, setHow] = useState("");
  const a = useAction();
  const link =
    a.result?.ok && a.result.data?.token && typeof window !== "undefined"
      ? `${window.location.origin}/p/${a.result.data.token}`
      : null;
  return (
    <details className="card">
      <summary>➕ Add a walk-in</summary>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" maxLength={30} />
      <input value={how} onChange={(e) => setHow(e.target.value)} placeholder="How they know you" maxLength={40} />
      <Btn
        pending={a.pending}
        onClick={() =>
          a.run(
            () => hostAddWalkIn(token, name, how),
            (r) => {
              if (r.ok) {
                setName("");
                setHow("");
              }
            },
          )
        }
      >
        Add and check in
      </Btn>
      <Flash result={a.result} />
      {link && (
        <p className="small">
          AirDrop or text them their link: <a href={link}>{link}</a>
        </p>
      )}
    </details>
  );
}

function Missions({ data }: { data: AdminData }) {
  const [text, setText] = useState("");
  const [diff, setDiff] = useState("M");
  const [editing, setEditing] = useState<string | null>(null);
  const a = useAction();
  const active = data.missions.filter((m) => m.active).length;
  return (
    <details className="card">
      <summary>
        🗂️ Missions ({active} active of {data.missions.length})
      </summary>
      <div className="row wrap">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="New mission…" maxLength={200} style={{ flex: 1, minWidth: 200 }} />
        <select value={diff} onChange={(e) => setDiff(e.target.value)} style={{ width: 90 }}>
          <option value="E">Easy</option>
          <option value="M">Medium</option>
          <option value="H">Hard</option>
        </select>
        <Btn pending={a.pending} onClick={() => a.run(() => hostAddMission(data.token, text, diff), (r) => r.ok && setText(""))}>
          Add
        </Btn>
      </div>
      <p className="muted small">New missions are handed out from the next new target or swap. Hard ones only appear late in the game.</p>
      <Flash result={a.result} />
      <div className="list">
        {data.missions.map((m) =>
          editing === m.id ? (
            <EditMission key={m.id} token={data.token} m={m} done={() => setEditing(null)} />
          ) : (
            <div key={m.id} className="row" style={{ opacity: m.active ? 1 : 0.45 }}>
              <span className="tag">{m.difficulty}</span>
              <span style={{ flex: 1 }} className="small">
                {m.text}
              </span>
              <Btn kind="small" onClick={() => setEditing(m.id)}>
                Edit
              </Btn>
              <Btn kind="small" pending={a.pending} onClick={() => a.run(() => hostToggleMission(data.token, m.id, !m.active))}>
                {m.active ? "Turn off" : "Turn on"}
              </Btn>
            </div>
          ),
        )}
      </div>
    </details>
  );
}

function EditMission({ token, m, done }: { token: string; m: AdminData["missions"][number]; done: () => void }) {
  const [text, setText] = useState(m.text);
  const [diff, setDiff] = useState<string>(m.difficulty);
  const a = useAction();
  return (
    <div className="stack">
      <div className="row wrap">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} style={{ flex: 1, minWidth: 200 }} />
        <select value={diff} onChange={(e) => setDiff(e.target.value)} style={{ width: 90 }}>
          <option value="E">Easy</option>
          <option value="M">Medium</option>
          <option value="H">Hard</option>
        </select>
        <Btn kind="small" pending={a.pending} onClick={() => a.run(() => hostEditMission(token, m.id, text, diff), (r) => r.ok && done())}>
          Save
        </Btn>
        <Btn kind="small" onClick={done}>
          Cancel
        </Btn>
      </div>
      <Flash result={a.result} />
    </div>
  );
}

function Feed({ data }: { data: AdminData }) {
  return (
    <details className="card">
      <summary>📜 Everything that&apos;s happened</summary>
      <div className="stack">
        {data.feed.length === 0 && <p className="muted small">Nothing yet.</p>}
        {data.feed.map((e) => (
          <p key={e.id} className="small">
            <span className="muted mono">{time(e.at)}</span> {e.text}
          </p>
        ))}
      </div>
    </details>
  );
}
