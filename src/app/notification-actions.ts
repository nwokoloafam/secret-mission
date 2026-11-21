"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db/client";
import { playerByToken } from "@/lib/db/queries";
import { notificationsEnabled } from "@/lib/notifications";
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
