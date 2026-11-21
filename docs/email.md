# Optional email extension

This is a separate follow-up to the in-page inbox. Email remains off by default. Players can optionally provide an email address and consent at signup or on their personal page, then opt out later. Everyone keeps the in-page inbox regardless of email choice. Opted-out players are reminded to save their personal link and check the site for the latest updates.

No SMS or system/browser push alerts are included. Vercel delivery uses Next.js `after()` and does not depend on Cloudflare or a laptop worker.

## Separate database migration

Apply `0003_notifications.sql` for the inbox first, then `0004_email_notifications.sql` for this extension. Migration 0004 adds:

- Optional `players.email`, `email_opt_in` (false by default), and `email_consent_at`.
- `email_outbox`, linked to an inbox entry and containing its recipient snapshot, preview/live mode, and send status.
- `email_dispatch_control` for shared pacing and daily limits.

Existing players and inbox history are preserved. The migration never opts existing players into email. New tables have row-level security and no public access policy. No production migration is run automatically by CI or deployment.

## What gets emailed

Personal links, assignment changes, host announcements, start, pause, resume, and end can queue optional email reminders. Hints, elimination notices, end-time changes, and round-reset notices remain in-page. Starting produces one start notification per player, not an additional assignment email.

Email contains a generic update and the player's private page link, not the secret target, mission, or announcement body. Keep these links private because they authorize player actions. The host can inspect email previews and queue status. Provider acceptance is shown separately from delivery; bounce/delivery webhooks are not implemented.

## Test without sending

Use the isolated local PostgreSQL setup in [inbox testing](notifications.md). Run `node scripts/email-preview.mjs` against `secret_mission_notifications_preview`. It applies migration 0004 and sets simulated email preferences on the eight named fake players (half opted in); rerunning it resets those fixture preferences. It rejects non-loopback hosts and other database names. It does not send email or test photo uploads.

In an ignored `.env.local`, set the local database URL, `NOTIFICATIONS_ENABLED=true`, `EMAIL_MODE=dry-run`, `EMAIL_APP_URL=http://localhost:3003`, and a random `EMAIL_DISPATCH_SECRET` of at least 32 characters. No Brevo key is needed. Run the app, exercise signup/preferences/announcements, and inspect the host outbox. Successful actions process the queue after their response; valid player/admin page visits also trigger recovery, at most once per 30 seconds in each warm server instance. The optional `node --env-file=.env.local scripts/email-worker.mjs` provides independent polling; stop it with Ctrl-C afterward. No HTTP request to Brevo is made in dry-run mode.

`npm test` includes provider/authentication tests with mocked HTTP, deferred background-connection lifecycle checks, and deterministic 30-player drain tests covering both paced acceptance and thirty full eight-second uncertain timeouts. Real database integration tests require `CORE_TEST_DATABASE_URL` ending in `/secret_mission_notifications_coretest` and `TEST_DATABASE_URL` ending in `/secret_mission_notifications_test`, both loopback-only. These exact disposable schemas are reset. The tests verify the separate migration preserves existing players/inbox, consent and recipient isolation, round-reset suppression, queue-mode isolation, concurrency, and caps. GitHub creates both test databases automatically. No tests send real emails.

## Activation order

1. Keep `EMAIL_MODE=off`. Apply migration 0004 to the intended database before deploying this extension to a host with in-page notifications enabled. The inbox-only application continues working with this additive schema.
2. Deploy the email feature code. Keep versions/settings aligned on every host writing to the shared database. Verify the in-page inbox and unchecked email consent first.
3. Create the Brevo account, verify the sender, and authenticate its sending domain as required. Store `BREVO_API_KEY` as a server secret, never in source/chat/public variables. Set `EMAIL_FROM` to the verified sender and `EMAIL_APP_URL` to the canonical public game origin.
4. On Vercel, verify **Fluid Compute is enabled** before merging/deploying this feature. The signup, player and host pages and dispatch endpoint declare `maxDuration=300`; each drain runs for at most 270 seconds. Hobby supports 300 seconds with Fluid Compute, but only 60 seconds without it. No frequent Vercel Cron is required (Hobby Cron only runs daily). See [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration) and [Cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing).
5. Set a random `EMAIL_DISPATCH_SECRET` on the website for authenticated diagnostics/recovery. An optional independent dispatcher uses the same secret; the built-in `after()` trigger needs neither an HTTP self-call nor this secret. Set `EMAIL_DAILY_LIMIT=250` or lower, and enable `EMAIL_MODE=live` only when ready for an explicitly opted-in recipient test.
6. Verify actual mailbox/phone receipt, opt-out, and in-page updates before inviting guests. Queue a 30-player dry-run burst and confirm pending drains to zero with the worker stopped. Then explicitly test a consenting real recipient. Deployment settings, domain/sender verification, actual Vercel execution and mailbox delivery require their own verification; unit tests alone do not establish them.

The Brevo free account limit is 300/day; the app's default 250/day leaves headroom. Other mail sent through the same Brevo account also counts. No purchase, live credential provisioning, sender verification, or real send is included in this PR.

## Dispatch and delivery limits

Successful signup, preference changes and game actions schedule a drain with Next.js `after()`, after the game transaction commits and the UI response completes. Timer actions kick only when they change game state. Successful player/admin page renders provide recovery with a per-process 30-second cooldown and skip recovery while a local drain is active. No browser must stay open to finish an already-started drain. Background work opens and finally closes its own database client because request-client cleanup runs concurrently with `after()` callbacks.

Each drain processes up to 300 jobs or 270 seconds, whichever comes first, while honoring the shared one-attempt-per-second lock and daily cap. A normal 30-player burst takes about 30 seconds; even thirty full eight-second provider timeouts fit within one invocation, and uncertain outcomes do not stop remaining recipients. Provider timeouts are terminal `unknown` outcomes, not retries. Larger queues, exhausted daily budgets and long database outages can leave pending jobs; the next successful action or page visit resumes eligible jobs. The caps are safeguards, not an unbounded background loop.

`after()` extends the current invocation; it is **not a durable scheduler** and cannot guarantee a new invocation after a process crash, deployment interruption or prolonged outage when nobody visits the site. For recovery independent of site traffic, run the portable worker under an always-on supervisor or have an external scheduler call the authenticated endpoint. This is optional for normal event-driven party delivery; no such external service is provisioned by this PR. Inspect host queue status before the party and after interruptions. [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after) documents invocation lifetime and platform support.

The 270-second post-response drain is a Vercel Fluid Compute configuration. Cloudflare Workers allow [`waitUntil()` work for only 30 seconds after the response](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil), shared by background callbacks; `maxDuration=300` does not extend that limit. Keep email off on the parallel Cloudflare preview. Before enabling it there, configure and verify an independent dispatcher calling the authenticated endpoint with an adequate HTTP timeout, or implement a Cloudflare-specific queue consumer. The compatible database adapter alone does not establish email-delivery readiness on Cloudflare.

`POST /api/email/dispatch` runs the same bounded drain (allow at least 285 seconds for the HTTP client timeout). `GET` returns redacted queue counts and budget use. Both require `Authorization: Bearer <EMAIL_DISPATCH_SECRET>`; player and host tokens cannot call them. The independent dispatcher only needs that secret, not database or Brevo credentials. Do not put secrets in URLs or browser code.

Inbox entries and email jobs commit with the game action, without provider requests inside the transaction. Delivery rechecks current consent/address before reservation, reserves globally paced sends and daily budget, and does not retry ambiguous timeouts automatically. Opt-out suppresses pending jobs; an already reserved/in-flight message may still arrive.

Preview and live rows are permanently separated by delivery mode. Preview dispatch cannot consume live jobs or spend the live budget. A new round suppresses prior pending email while preserving inbox history. Personal-link jobs expire after 24 hours; other jobs expire after 30 minutes so stale alerts are not sent much later. Inspect the provider before manually handling uncertain/failed outcomes.

References: [Brevo free-plan limits](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans), [transactional API](https://developers.brevo.com/reference/send-transac-email).
