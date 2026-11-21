import "server-only";
import type postgres from "postgres";
import { db } from "@/lib/db/client";
import { emailConfig, validEmail } from "./email/config";
import type { PlannedNotification } from "./notification-plan";

export type InboxNotification = { id: string; kind: string; message: string; createdAt: string; readAt: string | null };
export const notificationsEnabled = () => process.env.NOTIFICATIONS_ENABLED === "true";
export function emailAvailable(): boolean {
  if (!notificationsEnabled()) return false;
  try { return emailConfig().mode !== "off"; } catch { return false; }
}
export function emailPreview(): boolean { return emailAvailable() && process.env.EMAIL_MODE === "dry-run"; }
export { validEmail };

const emailKinds = new Set(["personal_link", "new_target", "announcement", "game_started", "paused", "resumed", "game_over"]);
type Tx = postgres.TransactionSql;

/** Insert in the caller's transaction. The email address is snapshotted; delivery rechecks consent. */
export async function insertNotifications(tx: Tx, gameId: string, planned: PlannedNotification[]) {
  if (!notificationsEnabled() || planned.length === 0) return;
  const rows = planned.map((n) => ({ game_id: gameId, player_id: n.playerId, kind: n.kind, message: n.message }));
  const inserted = await tx`insert into player_notifications ${tx(rows, "game_id", "player_id", "kind", "message")}
    returning id, kind`;
  if (!emailAvailable()) return;
  const mode = emailConfig().mode;
  const ids = inserted.filter((n) => emailKinds.has(n.kind as string)).map((n) => n.id as string);
  if (mode === "off" || ids.length === 0) return;
  await tx`insert into email_outbox (notification_id, player_id, email, delivery_mode)
    select n.id, p.id, p.email, ${mode} from player_notifications n
    join players p on p.id = n.player_id and p.game_id = n.game_id
    where n.id = any(${ids}::uuid[]) and n.game_id = ${gameId}
      and p.email_opt_in and p.email is not null`;

}
export async function inboxForPlayer(playerId: string): Promise<InboxNotification[]> {
  if (!notificationsEnabled()) return [];
  const rows = await db()`select id, kind, message, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at, read_at from player_notifications
    where player_id = ${playerId} order by created_at desc, id desc limit 100`;
  return rows.map((r) => ({ id: r.id as string, kind: r.kind as string, message: r.message as string,
    createdAt: r.created_at as string, readAt: r.read_at ? new Date(r.read_at as string).toISOString() : null }));
}
