"use client";

import { markNotificationsRead } from "@/app/notification-actions";
import type { InboxNotification } from "@/lib/notifications";
import { Btn, Flash, useAction } from "@/components/ui";

export function Notifications({ token, notifications }: {
  token: string;
  notifications: InboxNotification[];
}) {
  const unread = notifications.filter((n) => !n.readAt).length;
  const read = useAction();
  return (
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
  );
}
