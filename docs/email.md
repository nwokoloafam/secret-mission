# Optional email extension

This is a separate follow-up to the in-page inbox. Email remains off by default. Players can optionally provide an email address and consent at signup or on their personal page, then opt out later. Everyone keeps the in-page inbox regardless of email choice. Opted-out players are reminded to save their personal link and check the site for the latest updates.

No SMS or system/browser push alerts are included. The Cloudflare-specific scheduler/configuration remains in hosting PR #2; this application extension also runs on Vercel.

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

In an ignored `.env.local`, set the local database URL, `NOTIFICATIONS_ENABLED=true`, `EMAIL_MODE=dry-run`, `EMAIL_APP_URL=http://localhost:3003`, and a random `EMAIL_DISPATCH_SECRET` of at least 32 characters. No Brevo key is needed. Run the app, exercise signup/preferences/announcements, and inspect the host outbox. To process previews, run `node --env-file=.env.local scripts/email-worker.mjs`; stop it with Ctrl-C afterward. No HTTP request to Brevo is made in dry-run mode.

`npm test` includes provider/authentication tests with mocked HTTP. Real database integration tests require `CORE_TEST_DATABASE_URL` ending in `/secret_mission_notifications_coretest` and `TEST_DATABASE_URL` ending in `/secret_mission_notifications_test`, both loopback-only. These exact disposable schemas are reset. The tests verify the separate migration preserves existing players/inbox, consent and recipient isolation, round-reset suppression, queue-mode isolation, concurrency, and caps. GitHub creates both test databases automatically. No tests send real emails.

## Activation order

1. Keep `EMAIL_MODE=off`. Apply migration 0004 to the intended database before deploying this extension to a host with in-page notifications enabled. The inbox-only application continues working with this additive schema.
2. Deploy the email feature code. Keep versions/settings aligned on every host writing to the shared database. Verify the in-page inbox and unchecked email consent first.
3. Create the Brevo account, verify the sender, and authenticate its sending domain as required. Store `BREVO_API_KEY` as a server secret, never in source/chat/public variables. Set `EMAIL_FROM` to the verified sender and `EMAIL_APP_URL` to the canonical public game origin.
4. Set a random `EMAIL_DISPATCH_SECRET` on the website and independent dispatcher. Set `EMAIL_DAILY_LIMIT=250` or lower, and enable `EMAIL_MODE=live` only when ready for an explicitly opted-in recipient test.
5. Configure an always-on dispatcher and verify actual mailbox/phone receipt, opt-out, and in-page updates before inviting guests. The portable worker script is useful locally; do not rely on a laptop process for the party. Cloudflare's separate scheduled Worker is supplied in PR #2 and calls the same authenticated endpoint on either host.

The Brevo free account limit is 300/day; the app's default 250/day leaves headroom. Other mail sent through the same Brevo account also counts. No purchase, live credential provisioning, sender verification, or real send is included in this PR.

## Dispatch and delivery limits

`POST /api/email/dispatch` processes bounded batches. `GET` returns redacted queue counts and budget use. Both require `Authorization: Bearer <EMAIL_DISPATCH_SECRET>`; player and host tokens cannot call them. The independent dispatcher only needs that secret, not database or Brevo credentials.

Inbox entries and email jobs commit with the game action, without provider requests inside the transaction. Delivery rechecks current consent/address before reservation, reserves globally paced sends and daily budget, and does not retry ambiguous timeouts automatically. Opt-out suppresses pending jobs; an already reserved/in-flight message may still arrive.

Preview and live rows are permanently separated by delivery mode. Preview dispatch cannot consume live jobs or spend the live budget. A new round suppresses prior pending email while preserving inbox history. Personal-link jobs expire after 24 hours; other jobs expire after 30 minutes so stale alerts are not sent much later. Inspect the provider before manually handling uncertain/failed outcomes.

References: [Brevo free-plan limits](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans), [transactional API](https://developers.brevo.com/reference/send-transac-email).
