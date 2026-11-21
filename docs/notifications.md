# Personal updates and optional email

Every player receives a private in-page inbox with unread indicators. The existing page refresh checks for changes while the page is visible and when the player returns to it. There are no system/browser push alerts, Home Screen installation requirements, or SMS integrations. Players are prompted to copy/save their private link and monitor the page when emails are off.

Email is optional and unchecked at signup. Existing players can enable or disable it on their own page. The host can inspect email previews and queue status. In preview mode nothing is delivered and no email service account is needed.

## Events

Personal links, assignment changes, host announcements, start, pause, resume, and end produce optional email reminders as well as in-page updates. Hints, elimination notices, and end-time changes appear in-page. Announcements go to the game's players except those who left; assignment changes go only to the affected living player. Starting a game produces one start notification per player, not a start plus a separate assignment email.

Messages contain a private page link, not the secret target, mission, or announcement body. The inbox contains the full host announcement. Keep personal links private: they authorize player actions.

## Local rehearsal without sending email

Use a separate PostgreSQL database, never the shared production Supabase database. The preview seeder deliberately refuses anything except a loopback host and the database name `secret_mission_notifications_preview`.

1. Start a local PostgreSQL instance and create `secret_mission_notifications_preview`. The default preview connection is `postgres://postgres@127.0.0.1:55439/secret_mission_notifications_preview`; set `PREVIEW_DATABASE_URL` if your local instance needs a password or different port.
2. Run `node scripts/notifications-preview.mjs`. It applies the initial schema and notification migration to an empty database and seeds eight fake checked-in players. The storage schema is a local stub: this rehearsal does not test photo uploads.
3. Configure an ignored `.env.local` with that database URL, `NOTIFICATIONS_ENABLED=true`, `EMAIL_MODE=dry-run`, `EMAIL_APP_URL=http://localhost:3003`, and a random `EMAIL_DISPATCH_SECRET` of at least 32 characters. No Brevo key is needed.
4. Run `npm run dev -- --hostname 127.0.0.1 --port 3003`. Open `/admin/rehearsal-host` and `/p/rehearsal-alice`, `/p/rehearsal-bob`, etc. in separate tabs. Half the seeded players opt into simulated email. These fixture links are only for the isolated local database.
5. Start, broadcast, pause/resume, remove a target, change email preferences, and mark updates read. Inspect the host's email previews. To process the simulated queue, run `node --env-file=.env.local scripts/email-worker.mjs`; stop it with Ctrl-C afterward.

The seed command preserves an existing rehearsal instead of resetting it. Use the host's end/play-again controls to repeat a round. Recreate the disposable database if you need a clean signup/inbox history.

## Automated tests

`npm test` runs the engine, notification-planning, provider, authentication, and scheduler unit tests without external services. For real PostgreSQL integration tests, create the following two disposable databases and set their corresponding variables before `npm test`:

- `TEST_DATABASE_URL`: loopback PostgreSQL URL ending in `/secret_mission_notifications_test`.
- `CORE_TEST_DATABASE_URL`: loopback PostgreSQL URL ending in `/secret_mission_notifications_coretest`.

Integration tests reset those databases' public schemas. Guards refuse other database names or remote hosts. They verify actual transaction rollback, recipient isolation, consent changes, concurrent dispatch, daily caps, stale jobs, and separation of live/preview queues. Brevo HTTP calls are mocked, so tests never send email. GitHub checks provision a disposable PostgreSQL service and run these tests automatically.

## Activation order

Nothing in this feature automatically migrates production or enables sending.

The repository became public on November 21, 2026. Vercel's private-repository contributor restriction should no longer block previews; verify a fresh deployment rather than relying on an older blocked check. Preview deployment and successful build do not activate notifications: keep the feature off until the intended database has the migration. Use an isolated database for notification rehearsals because production hosts share Supabase.

1. Apply `supabase/migrations/0003_notifications.sql` once to the intended database. Do not rerun the initial schema or the unrelated timeout migration. This adds columns/tables without changing existing game data.
2. Deploy the feature code to every host writing to the shared database. Set `NOTIFICATIONS_ENABLED=true` on those hosts only after the migration. Keep their notification/email modes aligned: an old or disabled deployment will not create inbox entries for its actions.
3. For in-page updates alone, leave `EMAIL_MODE=off`. For an isolated rehearsal, use `dry-run`. Preview rows are permanently tagged `dry-run`, and live dispatch never sends them.
4. Create the free Brevo account, verify the sender, and authenticate its sending domain as required by Brevo. Store `BREVO_API_KEY` as a server-side secret. Set `EMAIL_FROM` to the verified sender and `EMAIL_APP_URL` to the chosen canonical game origin. Never derive private-link destinations from incoming request headers.
5. Set a random `EMAIL_DISPATCH_SECRET` on the website and the independent dispatcher. Set `EMAIL_MODE=live` and keep `EMAIL_DAILY_LIMIT=250` or lower. The hard application ceiling is 300 per UTC day; the default leaves room below Brevo's 300/day free account limit. Other mail sent through the same Brevo account also counts toward its limit.
6. Run the dispatcher continuously, independently of game tabs, as described below. Verify one explicitly opted-in test recipient, opt-out, and a real handset/mailbox before inviting guests. Provider acceptance is not proof of inbox delivery.

Set these values as server environment variables on the host running this feature. Keep settings aligned across every host writing to the same database. The Cloudflare-specific deployment bindings and scheduler are supplied separately in hosting PR #2. This application PR can deploy on Vercel independently.

## Independent dispatcher

The authenticated `POST /api/email/dispatch` processes a bounded batch. `GET` returns redacted queue counts and budget use; both require `Authorization: Bearer <EMAIL_DISPATCH_SECRET>`. No player or host token can invoke this endpoint.

For local testing or an existing always-on server, `scripts/email-worker.mjs` polls the endpoint. Do not rely on a laptop process for the party.

The independent Cloudflare scheduler is supplied separately in hosting PR #2. It calls this endpoint and can target either host. Until an always-on dispatcher is configured, inbox updates work but emails remain queued.

## Delivery behavior and limits

Inbox entries and email jobs are committed with their game action. No provider request happens inside that transaction, so provider outages cannot interrupt gameplay. Optional messages are paced across dispatchers, counted against a shared daily cap, and rechecked against current opt-in/address before reservation. Opt-out suppresses pending jobs; an already reserved/in-flight email may still arrive.

Preview and live jobs are isolated by `delivery_mode`. A preview dispatcher cannot consume, expire, or reclassify live jobs, and a live dispatcher cannot send previews. Preview sends make no network call and consume no live budget.

Personal-link jobs expire after 24 hours; other pending emails expire after 30 minutes to avoid sending stale game alerts. Budget exhaustion leaves jobs queued until a later run or expiry. Unknown/timeout outcomes are never retried automatically, since Brevo may already have accepted the request. Inspect the provider before manually handling uncertain/failed sends. Queued acceptance is shown distinctly from delivery; delivery/bounce webhooks are not implemented in this version.

References: [Brevo free-plan limits](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans), [Brevo transactional email API](https://developers.brevo.com/reference/send-transac-email).
