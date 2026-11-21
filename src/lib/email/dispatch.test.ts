import { afterEach, describe, expect, it, vi } from "vitest";
import type postgres from "postgres";
vi.mock("server-only", () => ({}));
import { dispatchEmail } from "./dispatch";

const env = { NOTIFICATIONS_ENABLED: "true", EMAIL_MODE: "live", EMAIL_APP_URL: "https://party.afam.party",
  EMAIL_FROM: "host@example.com", BREVO_API_KEY: "private-key", EMAIL_DAILY_LIMIT: "250" };

// A queue boundary fixture: database-specific concurrency/consent/daily limits
// are exercised separately by dispatch.integration.test.ts against PostgreSQL.
function queue(count: number) {
  const pending = Array.from({ length: count }, (_, i) => ({ id: `job${i}`, email: `guest${i}@example.com`, token: `private-token-${i}`, kind: "announcement" }));
  const terminal: string[] = [];
  let lastAttempt: number | undefined;
  const query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.startsWith("select o.id")) return pending.length ? [pending[0]] : [];
    if (text.startsWith("select attempts,")) return [{ attempts: terminal.length, wait_ms: lastAttempt === undefined ? 0 : Math.max(0, lastAttempt + 1000 - Date.now()) }];
    if (text.includes("set last_attempt_at = clock_timestamp()")) lastAttempt = Date.now();
    if (text.includes("set status = 'sending'")) pending.shift();
    if (text.startsWith("update email_outbox set status = ?")) terminal.push(values[0] as string);
    return [];
  };
  const sql = Object.assign(query, { begin: (callback: (tx: typeof query) => Promise<unknown>) => callback(query) }) as unknown as postgres.Sql;
  return { sql, pending, terminal };
}

describe("bounded event-driven queue drain", () => {
  afterEach(() => vi.useRealTimers());

  it("drains a 30-player burst beyond the old 20-job cap with paced sends", async () => {
    vi.useFakeTimers();
    const jobs = queue(30);
    const times: number[] = [];
    const fetcher = vi.fn(async () => { times.push(Date.now()); return new Response(JSON.stringify({ messageId: "accepted" }), { status: 201 }); });
    const run = dispatchEmail(jobs.sql, { env: { ...env, EMAIL_DAILY_LIMIT: "300" }, fetch: fetcher });
    await vi.runAllTimersAsync();
    expect(await run).toMatchObject({ processed: 30, outcomes: { sent: 30 }, stopped: "empty" });
    expect(jobs.pending).toHaveLength(0);
    expect(times.every((time, i) => i === 0 || time - times[i - 1] >= 1000)).toBe(true);
  });

  it("continues after 30 full-timeout unknown outcomes within the Vercel budget", async () => {
    vi.useFakeTimers();
    const started = Date.now();
    const jobs = queue(30);
    const fetcher = vi.fn(() => new Promise<Response>((_resolve, reject) => setTimeout(() => reject(new Error("ambiguous timeout")), 8000)));
    const run = dispatchEmail(jobs.sql, { env: { ...env, EMAIL_DAILY_LIMIT: "300" }, fetch: fetcher });
    await vi.runAllTimersAsync();
    expect(await run).toMatchObject({ processed: 30, outcomes: { unknown: 30 }, stopped: "empty" });
    expect(fetcher).toHaveBeenCalledTimes(30);
    expect(jobs.pending).toHaveLength(0);
    expect(jobs.terminal).toEqual(Array(30).fill("unknown"));
    expect(Date.now() - started).toBe(240000);
  });

  it("leaves an oversized queue pending at the deadline for a later trigger", async () => {
    vi.useFakeTimers();
    const jobs = queue(400);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ messageId: "accepted" }), { status: 201 }));
    const run = dispatchEmail(jobs.sql, { env: { ...env, EMAIL_DAILY_LIMIT: "300" }, fetch: fetcher });
    await vi.runAllTimersAsync();
    expect(await run).toMatchObject({ processed: 270, stopped: "time_limit" });
    expect(jobs.pending).toHaveLength(130);
  });
});
