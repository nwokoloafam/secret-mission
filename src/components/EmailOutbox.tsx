import { db } from "@/lib/db/client";
import { notificationsEnabled } from "@/lib/notifications";
import { emailConfig } from "@/lib/email/config";
import { buildEmail } from "@/lib/email/messages";

/** Render only inside the authenticated host page. Never expose other players' mailboxes. */
export async function EmailOutbox({ gameId }: { gameId: string }) {
  if (!notificationsEnabled()) return null;
  let config;
  try { config = emailConfig(); } catch {
    return <section className="card"><h3>Email updates</h3><p>Email configuration needs attention. In-page updates still work.</p></section>;
  }
  if (config.mode === "off") return <section className="card"><h3>Email updates</h3><p>Emails are off. Players still receive updates on their personal pages.</p></section>;
  const rows = await db()`select o.id, o.status, n.kind, p.first_name, p.token
    from email_outbox o join player_notifications n on n.id = o.notification_id
    join players p on p.id = o.player_id where n.game_id = ${gameId} and o.delivery_mode = ${config.mode}
    order by o.created_at desc, o.id desc limit 30`;
  const labels: Record<string, string> = {
    pending: "Queued", sending: "Sending", sent: "Accepted by email provider", failed: "Failed",
    unknown: "Delivery uncertain — check provider", expired: "Expired", suppressed: "Skipped — preferences changed", dry_run: "Preview only",
  };
  return <section className="card">
    <h3>{config.mode === "dry-run" ? "Email previews — nothing is sent" : "Email updates"}</h3>
    <p className="muted small">{config.mode === "dry-run" ? "Check the messages below while rehearsing. No email account or credits are needed." : "Provider acceptance does not confirm inbox delivery. In-page updates remain available if an email fails."}</p>
    {!rows.length && <p className="muted small">No emails queued yet. Only players who opt in appear here.</p>}
    {rows.map((row) => {
      const message = buildEmail(row.kind as string, row.token as string, config.appUrl!);
      return <details key={row.id as string} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        <summary>{row.first_name as string}: {message.subject} · {labels[row.status as string] ?? "Unknown"}</summary>
        <p className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.textContent}</p>
      </details>;
    })}
  </section>;
}
