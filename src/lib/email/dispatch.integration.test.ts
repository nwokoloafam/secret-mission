import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { dispatchEmail, emailStatus } from "./dispatch";

const databaseUrl = process.env.TEST_DATABASE_URL;

function disposableDatabaseUrl(value: string): string {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.pathname !== "/secret_mission_notifications_test" || url.search || url.hash) {
    throw new Error("Integration tests require the exact disposable localhost database secret_mission_notifications_test");
  }
  return value;
}

describe.skipIf(!databaseUrl)("email dispatcher PostgreSQL integration (mocked Brevo)", () => {
  let sql: postgres.Sql;
  const liveEnv = { NOTIFICATIONS_ENABLED: "true", EMAIL_MODE: "live", EMAIL_APP_URL: "https://party.afam.party",
    EMAIL_FROM: "host@example.com", BREVO_API_KEY: "mock-key-never-sent", EMAIL_DAILY_LIMIT: "2" };
  const accepted = () => vi.fn<typeof fetch>().mockImplementation(async () =>
    new Response(JSON.stringify({ messageId: `<mock-${randomUUID()}@brevo>` }), { status: 201 }));

  beforeAll(async () => {
    // Validate before opening any connection, and especially before DDL.
    sql = postgres(disposableDatabaseUrl(databaseUrl!), { max: 5, prepare: false, ssl: false, onnotice: () => {} });
    await sql.unsafe("drop schema public cascade; create schema public; create schema if not exists storage; create table if not exists storage.buckets (id text primary key, name text, public boolean)");
    await sql.unsafe(await readFile(new URL("../../../supabase/migrations/0001_init.sql", import.meta.url), "utf8"));
    await sql.unsafe(await readFile(new URL("../../../supabase/migrations/0003_notifications.sql", import.meta.url), "utf8"));
    await sql.unsafe(await readFile(new URL("../../../supabase/migrations/0004_email_notifications.sql", import.meta.url), "utf8"));
  });
  beforeEach(async () => {
    await sql`truncate games cascade`;
    await sql`update email_dispatch_control set last_attempt_at = null, attempts = 0, budget_date = (now() at time zone 'UTC')::date where id = 1`;
  });
  afterAll(async () => { if (sql) await sql.end({ timeout: 2 }); });

  async function enqueue(options: { count?: number; kind?: string; ageMinutes?: number; mode?: "dry-run" | "live" } = {}) {
    const [game] = await sql`insert into games (name, admin_token) values ('Disposable test game', ${randomUUID()}) returning id`;
    const items: { id: string; playerId: string; token: string }[] = [];
    for (let i = 0; i < (options.count ?? 1); i++) {
      const token = `test-${randomUUID()}`;
      const [player] = await sql`insert into players (game_id, token, first_name, email, email_opt_in, email_consent_at)
        values (${game.id}, ${token}, 'Test Guest', ${`guest${i}@example.com`}, true, now()) returning id, email`;
      const [notification] = await sql`insert into player_notifications (game_id, player_id, kind, message)
        values (${game.id}, ${player.id}, ${options.kind ?? "announcement"}, 'SECRET TARGET ALICE AND SECRET MISSION') returning id`;
      const [outbox] = await sql`insert into email_outbox (notification_id, player_id, email, delivery_mode, created_at)
        values (${notification.id}, ${player.id}, ${player.email}, ${options.mode ?? "live"}, now() - ${options.ageMinutes ?? 0} * interval '1 minute') returning id`;
      items.push({ id: outbox.id, playerId: player.id, token });
    }
    return items;
  }

  it("atomically limits concurrent dispatchers and reserves globally paced attempts", async () => {
    const jobs = await enqueue({ count: 5 });
    const fetcher = accepted();
    await Promise.all([
      dispatchEmail(sql, { env: liveEnv, fetch: fetcher, maxDurationMs: 4000 }),
      dispatchEmail(sql, { env: liveEnv, fetch: fetcher, maxDurationMs: 4000 }),
    ]);
    const rows = await sql`select status, attempted_at from email_outbox order by attempted_at nulls last`;
    expect(rows.filter((r) => r.status === "sent")).toHaveLength(2);
    expect(rows.filter((r) => r.status === "pending")).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new Date(rows[1].attempted_at).getTime() - new Date(rows[0].attempted_at).getTime()).toBeGreaterThanOrEqual(1000);
    const status = await emailStatus(sql, liveEnv);
    expect(status.attemptsToday).toBe(2);
    expect(status.counts.find((r) => r.status === "pending")?.count).toBe(3);
    expect(JSON.stringify(status)).not.toMatch(/guest|private|token|provider_id|example.com/);
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.textContent).toContain("https://party.afam.party/p/");
    expect(jobs.some((job) => body.textContent.includes(job.token))).toBe(true);
    expect(body.textContent).not.toContain("SECRET TARGET");
    expect(body.textContent).not.toContain("ALICE");
  }, 10000);

  it("suppresses opted-out, changed-address and missing-consent jobs at claim time", async () => {
    const jobs = await enqueue({ count: 3 });
    await sql`update players set email_opt_in = false where id = ${jobs[0].playerId}`;
    await sql`update players set email = 'changed@example.com' where id = ${jobs[1].playerId}`;
    await sql`update players set email_consent_at = null where id = ${jobs[2].playerId}`;
    const fetcher = accepted();
    expect((await dispatchEmail(sql, { env: liveEnv, fetch: fetcher })).processed).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    const rows = await sql`select status from email_outbox`;
    expect(rows.every((r) => r.status === "suppressed")).toBe(true);
    expect((await emailStatus(sql, liveEnv)).attemptsToday).toBe(0);
  });

  it("dry-run completes preview jobs without HTTP or live budget consumption", async () => {
    await enqueue({ mode: "dry-run" });
    await sql`update email_dispatch_control set attempts = 7 where id = 1`;
    const fetcher = accepted();
    const result = await dispatchEmail(sql, { env: { NOTIFICATIONS_ENABLED: "true", EMAIL_MODE: "dry-run", EMAIL_DAILY_LIMIT: "1" }, fetch: fetcher });
    expect(result).toMatchObject({ mode: "dry-run", processed: 1, outcomes: { dry_run: 1 } });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await sql`select attempts from email_dispatch_control`)[0].attempts).toBe(7);
    expect((await sql`select status from email_outbox`)[0].status).toBe("dry_run");
  });

  it("never retries an ambiguous send or a stale sending reservation", async () => {
    await enqueue();
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("simulated timeout"));
    await dispatchEmail(sql, { env: liveEnv, fetch: fetcher });
    await dispatchEmail(sql, { env: liveEnv, fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await sql`select status, error_code from email_outbox`)[0]).toMatchObject({ status: "unknown", error_code: "provider_request_uncertain" });
    const [stale] = await enqueue();
    await sql`update email_outbox set status = 'sending', attempted_at = now() - interval '3 minutes' where id = ${stale.id}`;
    await dispatchEmail(sql, { env: liveEnv, fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await sql`select status, error_code from email_outbox where id = ${stale.id}`)[0]).toMatchObject({ status: "unknown", error_code: "stale_sending" });
  });

  it("expires old game updates after 30 minutes and personal links after 24 hours", async () => {
    const [oldUpdate] = await enqueue({ ageMinutes: 31, mode: "dry-run" });
    const [oldLink] = await enqueue({ kind: "personal_link", ageMinutes: 25 * 60, mode: "dry-run" });
    const [validLink] = await enqueue({ kind: "personal_link", ageMinutes: 2 * 60, mode: "dry-run" });
    await dispatchEmail(sql, { env: { NOTIFICATIONS_ENABLED: "true", EMAIL_MODE: "dry-run" }, fetch: accepted() });
    const rows = await sql`select id, status from email_outbox`;
    expect(rows.find((r) => r.id === oldUpdate.id)?.status).toBe("expired");
    expect(rows.find((r) => r.id === oldLink.id)?.status).toBe("expired");
    expect(rows.find((r) => r.id === validLink.id)?.status).toBe("dry_run");
  });

  it("rejects a noncanonical live URL before claiming or contacting the provider", async () => {
    await enqueue();
    const fetcher = accepted();
    await expect(dispatchEmail(sql, { env: { ...liveEnv, EMAIL_APP_URL: "https://party.afam.party/path?secret=1" }, fetch: fetcher })).rejects.toThrow("invalid_app_url");
    expect(fetcher).not.toHaveBeenCalled();
    expect((await sql`select status from email_outbox`)[0].status).toBe("pending");
    expect((await emailStatus(sql, liveEnv)).attemptsToday).toBe(0);
  });

  it("isolates claims, housekeeping and status counts between live and preview jobs", async () => {
    const byMode: Record<string, { id: string; token: string }[]> = {};
    for (const mode of ["live", "dry-run"] as const) {
      const [valid] = await enqueue({ mode });
      const [expired] = await enqueue({ mode, ageMinutes: 31 });
      const [suppressed] = await enqueue({ mode });
      await sql`update players set email_opt_in = false where id = ${suppressed.playerId}`;
      const [stale] = await enqueue({ mode });
      await sql`update email_outbox set status = 'sending', attempted_at = now() - interval '3 minutes' where id = ${stale.id}`;
      byMode[mode] = [valid, expired, suppressed, stale];
    }
    const dryEnv = { NOTIFICATIONS_ENABLED: "true", EMAIL_MODE: "dry-run" };
    const fetcher = accepted();
    await dispatchEmail(sql, { env: dryEnv, fetch: fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    const statusFor = async (mode: string) => {
      const rows = await sql`select id, status from email_outbox where delivery_mode = ${mode}`;
      return byMode[mode].map((job) => rows.find((r) => r.id === job.id)?.status);
    };
    expect(await statusFor("live")).toEqual(["pending", "pending", "pending", "sending"]);
    expect(await statusFor("dry-run")).toEqual(["dry_run", "expired", "suppressed", "unknown"]);
    const previewStatus = await emailStatus(sql, dryEnv);
    const liveStatus = await emailStatus(sql, liveEnv);
    expect(previewStatus.counts.reduce((total, row) => total + row.count, 0)).toBe(4);
    expect(liveStatus.counts.reduce((total, row) => total + row.count, 0)).toBe(4);
    expect(liveStatus.counts.find((row) => row.status === "pending")?.count).toBe(3);
    // Keep a fresh preview pending while the live worker runs: it must not
    // fall back to that queue after processing its own live job.
    const [pendingPreview] = await enqueue({ mode: "dry-run" });
    byMode["dry-run"].push(pendingPreview);
    await dispatchEmail(sql, { env: liveEnv, fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.textContent).toContain(byMode.live[0].token);
    expect(body.textContent).not.toContain(byMode["dry-run"][0].token);
    expect(await statusFor("live")).toEqual(["sent", "expired", "suppressed", "unknown"]);
    expect(await statusFor("dry-run")).toEqual(["dry_run", "expired", "suppressed", "unknown", "pending"]);
    expect((await emailStatus(sql, dryEnv)).attemptsToday).toBe(0);
    expect((await emailStatus(sql, liveEnv)).attemptsToday).toBe(1);
  }, 10000);
});
