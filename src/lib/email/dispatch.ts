import "server-only";
import type postgres from "postgres";
import { emailConfig, type EmailEnv } from "./config";
import { buildEmail } from "./messages";
import { sendEmail, type EmailSendResult } from "./provider";

type ClaimedJob = { id: string; email: string; token: string; kind: string };
type ClaimResult = { job: ClaimedJob } | { waitMs: number } | { stop: "empty" | "daily_limit" };
export type DispatchOptions = { env?: EmailEnv; fetch?: typeof fetch; maxBatch?: number; maxDurationMs?: number };

async function claimEmail(sql: postgres.Sql, mode: "dry-run" | "live", dailyLimit: number): Promise<ClaimResult> {
  return await sql.begin(async (tx) => {
    await tx`set local statement_timeout = '4000ms'`;
    await tx`set local lock_timeout = '2000ms'`;
    await tx`insert into email_dispatch_control (id) values (1) on conflict (id) do nothing`;
    // Every dispatcher must hold this one row while reserving a send slot and
    // daily budget. SKIP LOCKED alone would not enforce an account-wide limit.
    await tx`select id from email_dispatch_control where id = 1 for update`;
    await tx`update email_dispatch_control set budget_date = (now() at time zone 'UTC')::date, attempts = 0
      where id = 1 and budget_date <> (now() at time zone 'UTC')::date`;
    await tx`update email_outbox set status = 'unknown', error_code = 'stale_sending'
      where delivery_mode = ${mode} and status = 'sending' and coalesce(attempted_at, created_at) < now() - interval '2 minutes'`;
    await tx`update email_outbox o set status = 'expired', error_code = 'expired'
      from player_notifications n where n.id = o.notification_id and o.delivery_mode = ${mode} and o.status = 'pending'
      and o.created_at <= now() - case when n.kind = 'personal_link' then interval '24 hours' else interval '30 minutes' end`;
    await tx`update email_outbox o set status = 'suppressed', error_code = 'consent_changed'
      from players p where p.id = o.player_id and o.delivery_mode = ${mode} and o.status = 'pending'
      and (not p.email_opt_in or p.email_consent_at is null or p.email is null or lower(trim(p.email)) <> lower(trim(o.email)))`;
    const jobs = await tx<ClaimedJob[]>`select o.id, o.email, p.token, n.kind from email_outbox o
      join player_notifications n on n.id = o.notification_id and n.player_id = o.player_id
      join players p on p.id = o.player_id and p.game_id = n.game_id
      where o.delivery_mode = ${mode} and o.status = 'pending' and p.email_opt_in and p.email_consent_at is not null
      and lower(trim(p.email)) = lower(trim(o.email))
      order by o.created_at, o.id limit 1 for update of o, p skip locked`;
    if (!jobs.length) return { stop: "empty" };
    const [control] = await tx<{ attempts: number; wait_ms: number }[]>`select attempts,
      greatest(0, ceil(extract(epoch from (last_attempt_at + interval '1 second' - clock_timestamp())) * 1000))::int as wait_ms
      from email_dispatch_control where id = 1`;
    if (mode === "live" && control.attempts >= dailyLimit) return { stop: "daily_limit" };
    if (control.wait_ms > 0) return { waitMs: control.wait_ms };
    // Reserve before contacting Brevo, including refusals and unknown outcomes.
    // Dry runs use pacing, but do not spend any live daily budget.
    await tx`update email_dispatch_control set last_attempt_at = clock_timestamp(),
      attempts = attempts + ${mode === "live" ? 1 : 0} where id = 1`;
    await tx`update email_outbox set status = 'sending', attempted_at = clock_timestamp(), error_code = null
      where id = ${jobs[0].id} and delivery_mode = ${mode}`;
    return { job: jobs[0] };
  }) as ClaimResult;
}

export async function dispatchEmail(sql: postgres.Sql, options: DispatchOptions = {}) {
  const env = options.env ?? process.env;
  if (env.NOTIFICATIONS_ENABLED !== "true") return { mode: "off", processed: 0, stopped: "disabled" };
  const config = emailConfig(env);
  if (config.mode === "off") return { mode: "off", processed: 0, stopped: "off" };
  const maxBatch = Math.max(1, Math.min(20, Math.floor(options.maxBatch ?? 20) || 1));
  const maxDuration = Math.max(1, Math.min(20000, Math.floor(options.maxDurationMs ?? 20000) || 1));
  const started = Date.now();
  let processed = 0;
  let stopped = "time_limit";
  const outcomes: Record<string, number> = {};
  while (processed < maxBatch && Date.now() - started < maxDuration) {
    const claim = await claimEmail(sql, config.mode, config.dailyLimit);
    if ("stop" in claim) { stopped = claim.stop; break; }
    if ("waitMs" in claim) {
      const remaining = maxDuration - (Date.now() - started);
      if (claim.waitMs >= remaining) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000, claim.waitMs)));
      continue;
    }
    let result: EmailSendResult;
    try {
      const message = buildEmail(claim.job.kind, claim.job.token, config.appUrl!);
      const remaining = maxDuration - (Date.now() - started);
      // A reservation that reaches its deadline before an HTTP attempt is a
      // definite failure. Never leave a claimed item pending for a retry.
      result = remaining <= 0 ? { status: "failed", errorCode: "dispatch_deadline" } : await sendEmail({
        ...message, mode: config.mode, key: config.key, from: config.from, email: claim.job.email,
      }, options.fetch, Math.min(8000, remaining));
    } catch { result = { status: "failed", errorCode: "invalid_message" }; }
    const providerId = result.status === "sent" ? result.providerId : null;
    const errorCode = "errorCode" in result ? result.errorCode : null;
    await sql`update email_outbox set status = ${result.status}, provider_id = ${providerId}, error_code = ${errorCode}
      where id = ${claim.job.id} and delivery_mode = ${config.mode} and status = 'sending'`;
    processed++;
    outcomes[result.status] = (outcomes[result.status] ?? 0) + 1;
  }
  if (processed >= maxBatch) stopped = "batch_limit";
  return { mode: config.mode, processed, outcomes, stopped };
}

export async function emailStatus(sql: postgres.Sql, env: EmailEnv = process.env) {
  const config = emailConfig(env);
  const counts = await sql<{ status: string; count: number }[]>`select status, count(*)::int as count from email_outbox
    where delivery_mode = ${config.mode} group by status`;
  const control = await sql<{ attempts: number; budget_date: string }[]>`select
    case when budget_date = (now() at time zone 'UTC')::date then attempts else 0 end as attempts,
    budget_date::text from email_dispatch_control where id = 1`;
  return { mode: config.mode, counts, dailyLimit: config.dailyLimit, attemptsToday: config.mode === "live" ? control[0]?.attempts ?? 0 : 0 };
}
