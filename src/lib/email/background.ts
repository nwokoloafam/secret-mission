import "server-only";
import { after } from "next/server";
import { openDb } from "@/lib/db/client";
import { emailConfig } from "./config";
import { dispatchEmail } from "./dispatch";

let activeDrains = 0;
let nextRecoveryAt = 0;

/** Call after a committed action, or a successful authenticated page read.
 * No provider/database work runs until the response has finished. The process
 * cooldown is an optimization only; database claims enforce cross-instance safety.
 */
export function scheduleEmailDispatch({ recovery = false } = {}): void {
  if (process.env.NOTIFICATIONS_ENABLED !== "true") return;
  try { if (emailConfig().mode === "off") return; }
  catch { return; } // Invalid optional email settings must not break the game.
  if (recovery && (activeDrains > 0 || Date.now() < nextRecoveryAt)) return;
  nextRecoveryAt = Date.now() + 30000;
  after(async () => {
    if (recovery && activeDrains > 0) return;
    activeDrains++;
    let sql: ReturnType<typeof openDb> | undefined;
    try {
      sql = openDb();
      const result = await dispatchEmail(sql);
      if (result.stopped === "time_limit" || result.stopped === "batch_limit") {
        console.warn("Email drain reached its limit; pending jobs resume on the next action or page visit.");
      }
    } catch {
      // Provider/db errors may include credentials, private tokens or addresses.
      console.error("Email drain unavailable; pending jobs resume on the next action or page visit.");
    } finally {
      try { await sql?.end({ timeout: 5 }); }
      catch { console.error("Email drain connection cleanup failed."); }
      activeDrains--;
    }
  });
}
