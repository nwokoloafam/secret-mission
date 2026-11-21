import "server-only";
import type postgres from "postgres";
import { db } from "@/lib/db/client";
import type { PlannedNotification } from "./notification-plan";

export type InboxNotification = { id: string; kind: string; message: string; createdAt: string; readAt: string | null };
export const notificationsEnabled = () => process.env.NOTIFICATIONS_ENABLED === "true";
type Tx = postgres.TransactionSql;

/** Insert private updates atomically with the action that produced them. */
export async function insertNotifications(tx: Tx, gameId: string, planned: PlannedNotification[]) {
  if (!notificationsEnabled() || planned.length === 0) return;
  const rows = planned.map((n) => ({ game_id: gameId, player_id: n.playerId, kind: n.kind, message: n.message }));
  await tx`insert into player_notifications ${tx(rows, "game_id", "player_id", "kind", "message")}`;
}
export async function inboxForPlayer(playerId: string): Promise<InboxNotification[]> {
  if (!notificationsEnabled()) return [];
  const rows = await db()`select id, kind, message, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at, read_at from player_notifications
    where player_id = ${playerId} order by created_at desc, id desc limit 100`;
  return rows.map((r) => ({ id: r.id as string, kind: r.kind as string, message: r.message as string,
    createdAt: r.created_at as string, readAt: r.read_at ? new Date(r.read_at as string).toISOString() : null }));
}
