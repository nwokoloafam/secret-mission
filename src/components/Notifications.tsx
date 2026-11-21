"use client";

import { useState } from "react";
import { markNotificationsRead, updateEmailPreferences } from "@/app/notification-actions";
import type { InboxNotification } from "@/lib/notifications";
import { Btn, Flash, useAction } from "@/components/ui";

export const emailConsent = "I agree to receive emails with my personal game link, target changes, announcements, and game start, pause, resume, and end updates.";
export const emailsOff = "Emails are off. Save your personal link and check this page for the latest targets, announcements, and game updates.";

export function Notifications({ token, notifications, emailAvailable, emailPreview, emailOptIn, email }: {
  token: string;
  notifications: InboxNotification[];
  emailAvailable: boolean;
  emailPreview: boolean;
  emailOptIn: boolean;
  email: string | null;
}) {
  const unread = notifications.filter((n) => !n.readAt).length;
  const read = useAction();
  return (
    <>
      <section className="card" aria-labelledby="inbox-heading">
        <div className="row spread">
          <h3 id="inbox-heading">Your updates</h3>
          {unread > 0 && <span className="tag gold">{unread} unread</span>}
        </div>
        <span className="small muted" aria-live="polite" aria-atomic="true">
          {unread === 0 ? "No unread updates." : `${unread} unread update${unread === 1 ? "" : "s"}.`}
        </span>
        {notifications.length === 0 ? <p className="muted small">No updates yet.</p> : (
          <div className="stack">
            {notifications.map((n) => (
              <div key={n.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <p>{n.message} {!n.readAt && <span className="tag gold">New</span>}</p>
                <time className="muted small" dateTime={n.createdAt}>{new Date(n.createdAt).toISOString().replace("T", " ").slice(0, 16)} UTC</time>
              </div>
            ))}
          </div>
        )}
        {unread > 0 && <Btn kind="ghost" pending={read.pending} onClick={() => read.run(() => markNotificationsRead(token, notifications.reduce((latest, n) => n.createdAt > latest ? n.createdAt : latest, notifications[0].createdAt)))}>Mark these read</Btn>}
        <Flash result={read.result} />
      </section>
      <EmailPreferences token={token} available={emailAvailable} preview={emailPreview} initialOptIn={emailOptIn} initialEmail={email} />
    </>
  );
}

function EmailPreferences({ token, available, preview, initialOptIn, initialEmail }: { token: string; available: boolean; preview: boolean; initialOptIn: boolean; initialEmail: string | null }) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [email, setEmail] = useState(initialEmail ?? "");
  const save = useAction();
  return (
    <details className="card">
      <summary>Email update settings</summary>
      {preview && <p className="muted small">Email preview mode: messages stay in the host outbox and are not sent.</p>}
      {!available && <p className="muted small">Email updates are not active yet. Updates still appear here.</p>}
      {(available || initialOptIn) && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); save.run(() => updateEmailPreferences(token, email, optIn)); }}>
          {available && <label>Email address<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required={optIn} /></label>}
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} disabled={!available && !optIn} style={{ width: 20, minHeight: 20, flex: "none", marginTop: 2 }} />
            <span>{emailConsent}</span>
          </label>
          {!optIn && <p className="muted small">{emailsOff}</p>}
          <Btn type="submit" pending={save.pending}>Save email settings</Btn>
          <Flash result={save.result} />
        </form>
      )}
      {!available && !initialOptIn && <p className="muted small">{emailsOff}</p>}
    </details>
  );
}
