# Private in-page updates

Every player receives a private inbox on their personal page. Unread indicators and a mark-read control track what they have seen. The existing refresh checks for changes while the page is visible and when the player returns. Players are prompted to copy/save their private link and check the page for updates.

This feature does not collect email addresses, request email consent, send email/SMS, or use system/browser push alerts. Optional email is a separate follow-up with its own migration.

## Events and privacy

The inbox includes a personal-link reminder, assignment changes, host announcements, game start/pause/resume/end, hints, elimination notices, and end-time changes. Announcements go to the game's players except those who left. Assignment notices go only to the affected living player; the player opens their case file for the actual target and mission.

Starting produces one start notice per player. A round restart preserves inbox history and adds a new-round notice. The final catch does not create an obsolete assignment notice. Private links authorize player actions: keep them private.

## Database migration

`supabase/migrations/0003_notifications.sql` adds only `player_notifications`, its inbox index, and row-level security. Each row records its game, player, kind, message, creation time, and optional read time. No player email columns, email queue, or email delivery tables are included. Existing games and players are preserved.

Inbox entries commit in the same transaction as their game action. A failed insert rolls back that action rather than leaving the game and inbox inconsistent. Recipients are scoped to the game; marking updates read authenticates the player's private link and respects the displayed time cutoff.

## Local multi-player rehearsal

Use a separate PostgreSQL database, never the shared production Supabase database. The seeder refuses anything except a loopback host and the exact database name `secret_mission_notifications_preview`.

1. Start local PostgreSQL and create `secret_mission_notifications_preview`. The default connection is `postgres://postgres@127.0.0.1:55439/secret_mission_notifications_preview`; set `PREVIEW_DATABASE_URL` for another local port or password.
2. Run `node scripts/notifications-preview.mjs`. On an empty database it applies the initial schema, inbox migration, and mission seed, then creates eight checked-in fake players. The storage schema is a local stub: this does not test photo uploads.
3. Set the same database URL and `NOTIFICATIONS_ENABLED=true` in the ignored `.env.local` file. No email provider account or API key is needed.
4. Run `npm run dev -- --hostname 127.0.0.1 --port 3003`. Open `/admin/rehearsal-host`, `/p/rehearsal-alice`, and `/p/rehearsal-bob` in separate tabs. The other players are charlie, dina, eli, farah, gus, and hana.
5. Start the game, broadcast, pause/resume, remove a target, and mark updates read. Confirm the affected player alone gets a changed-assignment notice, other players receive announcements, and reading one player's inbox does not mark another's read.
6. End and restart the round. Confirm old inbox entries remain and the new-round notice appears. Check navigation and controls at desktop and phone widths.

The seeder preserves existing rehearsal data. Recreate only the disposable database if you need a clean fixture. These known fixture tokens must never be used in production.

## Automated checks

`npm test` runs the engine and notification-planning unit tests without external services. For real PostgreSQL integration tests, set `CORE_TEST_DATABASE_URL` to a loopback URL ending in `/secret_mission_notifications_coretest`.

The integration suite resets that exact database's public schema. Guards reject other names and remote hosts. Tests cover recipient isolation, transaction rollback, authenticated mark-read cutoffs, round-reset history, a 30-player broadcast, and compatibility with the old schema when the feature is off. They also verify that the inbox migration introduces no email storage. GitHub's application workflow provisions its own disposable PostgreSQL database and runs the suite.

## Deployment and verification

The application feature works on the existing Next/Vercel deployment independently of the Cloudflare hosting PR. The repository became public on November 21, 2026 and a fresh Vercel preview passed; preview access can still require Vercel login. A successful deployment does not automatically run migrations or enable notifications.

1. Deploy the code with `NOTIFICATIONS_ENABLED=false`.
2. Apply only `0003_notifications.sql` to the intended database. Do not rerun the initial schema or unrelated migrations.
3. Set `NOTIFICATIONS_ENABLED=true` on the deployed application and redeploy as required by its host.
4. Verify signup, a target reassignment, an announcement, and marking updates read in an isolated rehearsal. Complete phone interaction and photo-upload checks before the party.

Keep versions/settings aligned across hosts that write to the same database; older or disabled hosts do not produce inbox entries for their actions. Cloudflare and Vercel production hosts share Supabase, so creating another game there is not an isolated test. Neither this PR nor its CI applies the production migration or moves the domain.
