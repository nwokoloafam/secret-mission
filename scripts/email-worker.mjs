// Portable foreground worker: run under a process supervisor, not in a browser.
// A one-minute cron may alternatively POST to the same authenticated endpoint.
import { setTimeout as delay } from "node:timers/promises";

const appUrl = process.env.EMAIL_APP_URL;
const secret = process.env.EMAIL_DISPATCH_SECRET;
if (!appUrl || !secret || secret.length < 32 || secret.length > 256) {
  console.error("Set EMAIL_APP_URL and EMAIL_DISPATCH_SECRET (32-256 characters).");
  process.exit(1);
}
let endpoint;
try {
  const url = new URL(appUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:" && process.env.EMAIL_MODE === "dry-run"))) throw new Error();
  endpoint = new URL("/api/email/dispatch", url.origin);
} catch {
  console.error("EMAIL_APP_URL must be a canonical HTTPS origin (localhost allowed in dry-run).");
  process.exit(1);
}

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => controller.abort());
console.log("Email dispatcher running. Provider acceptance does not confirm delivery.");
while (!controller.signal.aborted) {
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST", redirect: "error", headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
    });
    if (!response.ok) console.error(`Dispatcher returned HTTP ${response.status}.`);
  } catch {
    if (!controller.signal.aborted) console.error("Dispatcher request failed; check server status.");
  }
  try { await delay(Math.max(1000, 20000 - (Date.now() - started)), undefined, { signal: controller.signal }); }
  catch { break; }
}
