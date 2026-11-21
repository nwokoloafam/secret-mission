"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db/client";
import { playerByToken } from "@/lib/db/queries";
import { emailAvailable, insertNotifications, notificationsEnabled, validEmail } from "@/lib/notifications";
import type { Result } from "./actions";

export async function markNotificationsRead(token: string, through: string): Promise<Result> {
  try {
  if (!notificationsEnabled()) return { ok: false, error: "Notifications are unavailable." };
  const p = await playerByToken(token);
  if (!p) return { ok: false, error: "This link isn't valid." };
  if (typeof through !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,6}Z$/.test(through) || Number.isNaN(Date.parse(through)) || Date.parse(through) > Date.now()) return { ok: false, error: "Invalid notification time." };
  await db()`update player_notifications set read_at = now() where player_id = ${p.id} and created_at <= ${through}::timestamptz and read_at is null`;
  refresh();
  return { ok: true };
  } catch { return { ok: false, error: "Could not update notifications. Please try again." }; }
}

export async function updateEmailPreferences(token: string, email: string, optIn: boolean): Promise<Result> {
  try {
  if (!notificationsEnabled()) return { ok: false, error: "Notifications are unavailable." };
  const p = await playerByToken(token);
  if (!p) return { ok: false, error: "This link isn't valid." };
  if (typeof email !== "string" || typeof optIn !== "boolean") return { ok: false, error: "Invalid email preferences." };
  const address = email.trim().toLowerCase();
  if (optIn && !emailAvailable()) return { ok: false, error: "Email updates are unavailable right now." };
  if (optIn && !validEmail(address)) return { ok: false, error: "Enter a valid email address." };
  await db().begin(async (tx) => {
    const [old] = await tx`select email, email_opt_in from players where id = ${p.id} for update`;
    const changed = optIn && (!old.email_opt_in || old.email !== address);
    await tx`update players set email = ${validEmail(address) ? address : null}, email_opt_in = ${optIn},
      email_consent_at = ${optIn ? new Date().toISOString() : null} where id = ${p.id}`;
    if (!optIn || old.email !== address) {
      await tx`update email_outbox set status = 'suppressed' where player_id = ${p.id} and status = 'pending'`;
    }
    if (changed) await insertNotifications(tx, p.game_id, [{ playerId: p.id, kind: "personal_link", message: "Your personal game link is ready. Save this page to return." }]);
  });
  refresh();
  return { ok: true, message: "Email preferences saved." };
  } catch { return { ok: false, error: "Could not save email preferences. Please try again." }; }
}
