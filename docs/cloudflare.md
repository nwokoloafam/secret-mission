# Cloudflare deployment

This branch adds a Cloudflare Workers deployment alongside the existing Next.js / Vercel deployment. It does not change DNS, game rules, page design, or the database schema. Afam can keep working on the application and the existing `npm run dev` / `npm run build` commands.

Cloudflare deployment is currently paused while Vercel remains the active host. CI still validates the builds, but the deployment job runs only when the GitHub repository variable `CLOUDFLARE_DEPLOY_ENABLED` is exactly `true`. To resume later, configure the deployment token and runtime settings below, set that variable, and run the workflow on `main`. This gate does not affect Vercel, DNS, or an already-deployed Worker.

## Local prerequisites

Use Node 24.22+ (the version in `.nvmrc`); the new Cloudflare CLI requires a more recent Node patch than the original project. Run `npm ci`.

Copy `.dev.vars.example` to `.dev.vars` and fill in the three values. This file is gitignored. Use Supabase's **transaction pooler** connection string, port 6543, with its password URL-encoded. Keep real values out of Git and build configuration.

- `DATABASE_URL`: server-only Postgres connection string.
- `SUPABASE_URL`: the existing project's API URL.
- `SUPABASE_SERVICE_ROLE_KEY`: existing server-only secret key, used for photo uploads.

The hosted Worker uses the configured Hyperdrive binding. Local Workers development points that binding at local Supabase (`127.0.0.1:54322`) by default; start and seed a local database first, or export `LOCAL_DATABASE_URL` before running the dev command to select another isolated database. It does not automatically reuse the production `DATABASE_URL` when the binding is present.

Supabase is retained for data and photos. Pointing both deployments at the same project means both operate on the same games. Use an isolated test database for destructive rehearsals; the current signup flow selects the newest unfinished game, so creating a second game in the live database does not isolate it.

## Commands

```sh
npm test                    # engine, Workers connection lifecycle, scheduler checks
npm run typecheck
npm run check:cloudflare     # framework compatibility report
npm run dev:cloudflare       # Workers runtime locally, port 3001
npm run build:cloudflare     # .cloudflare/output/v0
npm run preview:cloudflare   # serve the built Worker locally
npm run deploy:cloudflare    # build and deploy; preserve existing remote secrets
# For the first deployment (or to update local secret values):
npm run deploy:cloudflare -- --secrets-file .dev.vars
```

The deployment uses vinext and Cloudflare's Vite plugin. The migration tooling is still beta; the checked-in lockfile pins the versions we validate. No response caching is configured because pages contain private player/admin state.

## Database lifecycle

Cloudflare sockets belong to the request that creates them. `vite.config.ts` maps the normal database client to `client.cloudflare.ts` in the Worker build only. That adapter shares a connection during a React server render, opens independent clients for calls outside that render, and closes every created client after the response. It uses the `HYPERDRIVE` binding when configured; the `DATABASE_URL` fallback disables prepared statements and limits pipelining for Supabase transaction pooling. The existing Next/Vercel client is unchanged.

Hosted Workers cannot validate this project's Supabase certificate through the raw socket driver. Use Hyperdrive with the Supabase **direct** endpoint (port 5432, user `postgres`), its public CA certificate, and `verify-full` TLS verification. Hyperdrive manages the encrypted origin connection; the adapter connects to its internal proxy. The `secret-mission-db` configuration has query caching disabled so joins and game actions are immediately visible, and limits origin connections to five for the shared database.

Download the public certificate from Supabase **Database → Settings → SSL configuration → Download certificate**. Creating the certificate configuration requires the CLI's `ssl_certs:write` scope in addition to deployment permissions. Never put the database password or API keys in configuration committed to Git. See [Cloudflare's Supabase setup](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/) and [certificate verification](https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/).

## Accounts and deployment

The Worker is named `secret-mission` in Radhika's Cloudflare account. Deploy to its `workers.dev` URL first. Keep the existing Vercel deployment and domain unchanged until the Worker has been verified.

The account already has `chinniradhika98.workers.dev`. Manage it under **Compute → Workers & Pages → Account details → Subdomain**; no new domain purchase is needed.

Authenticate with `npx cf auth login --scopes account:read user:read workers:write workers_scripts:write ssl_certs:write`. Secret values are supplied to Cloudflare at runtime, not embedded in builds. A browser login alone does not authenticate the local CLI.

To share management access: Cloudflare **Manage account → Members → Invite members**. A **Super Administrator – All Privileges** member has full control of the whole account, including billing and other members. Each person uses their own login. Choose a narrower Workers role when full account control is not intended.

## GitHub checks and deployment

`.github/workflows/checks.yml` runs tests, TypeScript, the Cloudflare application and scheduler builds, and the original Next build on pull requests and relevant pushes. On `main`, the **Deploy to Cloudflare** job runs only after those checks pass and the repository variable `CLOUDFLARE_DEPLOY_ENABLED` is `true`. Manual runs use the same opt-in gate. PRs and the migration branch never deploy production or receive the deployment token.

Before enabling deployment, add a dedicated Cloudflare API token as the GitHub repository Actions secret **`CLOUDFLARE_API_TOKEN`**. Use Workers Scripts Edit for this Cloudflare account; domain cutover additionally needs Zone Read and Workers Routes Edit scoped to `afamnwokolo.com`. Existing Hyperdrive bindings do not require a separate Hyperdrive provisioning permission. Do not grant certificate-management permission to CI. Runtime database/photo secrets remain in Cloudflare; do not copy them to GitHub or expose them as `NEXT_PUBLIC_`/`VITE_` variables. The deployment preserves the already configured remote secrets. Do not use a personal CLI OAuth token as the CI secret.

The job deploys the built Worker with automatic resource provisioning disabled and checks that its database-backed signup page responds correctly. When domain cutover is enabled, it checks the main-domain signup page too. This is a deployment smoke check, not a full game rehearsal. Keep Cloudflare's separate native Builds integration disconnected to avoid duplicate deployments.

## Parallel hosting and future Vercel retirement

Keep Vercel Git deployments enabled throughout Cloudflare testing. This PR does not disable or disconnect Vercel. Afam can continue deploying the existing site at `game.afamnwokolo.com` while the Worker is tested at `https://secret-mission.chinniradhika98.workers.dev`. Cloudflare deployment does not require turning off Vercel.

Both hosted sites use the same Supabase project, so player records and game actions are shared. Browser cookies are specific to each hostname. To open an existing player on Cloudflare, keep the complete `/p/<token>` path from their personal Vercel link and replace only the hostname with `secret-mission.chinniradhika98.workers.dev`; do not sign up again. Keep personal links private. The two deployments may temporarily run different code versions.

**Future step, after the domain cutover and verification below:** disable Vercel automatic Git deployments with `git.deploymentEnabled: false` in `vercel.json`, or have the Vercel project owner disconnect this project's Git integration in **Project → Settings → Git → Connected Git Repository → Disconnect**. Preserve the project and last working deployment for rollback. Do not remove the Vercel GitHub app from unrelated repositories.

The repository became public on November 21, 2026, resolving the prior Vercel author-permission blocker on fresh app deployments. Preview access can still require Vercel login/approval; that is separate from deployment permission. Keep the Vercel integration enabled. Older failed statuses are not rewritten. Review any required Vercel status checks when retiring the integration; no repository rules were changed by this migration.

## Main domain cutover

The configured target is **`game.afamnwokolo.com`**. It is opt-in: set the GitHub repository Actions variable **`CLOUDFLARE_ENABLE_CUSTOM_DOMAIN=true`** only when DNS is ready. The workflow passes it to both build and deploy. Local/manual equivalent: `CLOUDFLARE_ENABLE_CUSTOM_DOMAIN=true npm run deploy:cloudflare`. Leave it unset for the workers.dev testing address before cutover. After cutover, keep it true for every deployment of this Worker, including manual deployments, so the domain remains in the desired configuration.

DNS inspection found `afamnwokolo.com` on WordPress nameservers and the `game` CNAME pointing to `197b1a13acb40c56.vercel-dns-017.com`. Workers Custom Domains require an active Cloudflare zone in the Worker's account; merely changing the WordPress CNAME to workers.dev is not sufficient.

The domain owner needs to export/inventory the complete WordPress DNS zone, add it to Cloudflare, preserve existing website/email/verification records, and change the nameservers at the registrar to the assigned Cloudflare nameservers. This is a DNS-provider change; the domain registration can stay where it is. Verify DNSSEC handling before changing nameservers. Preserve the Vercel `game` record during that initial move so the live game stays available.

After gameplay verification and once the zone is active, remove the old `game` CNAME, enable the variable above, and run the main deployment to attach the Custom Domain and issue its certificate. Verify HTTPS and the signup/player/admin workflow on the main hostname. Keep Vercel available for rollback; restoring the recorded Vercel CNAME is the DNS rollback path, after detaching the Worker hostname. DNS and account changes occur outside Git; this PR alone does not perform them.

References: [Vercel Git deployment controls](https://vercel.com/docs/project-configuration/git-configuration), [disconnecting Vercel Git](https://vercel.com/docs/project-configuration/git-settings#disconnect-your-git-repository), [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## Verification before domain cutover

- Both builds, TypeScript, and engine/adapter tests pass.
- The Worker bundle resolves all database imports to the request-scoped adapter.
- Test actual hosted home/join/player/admin pages and repeated database reads.
- Rehearse signup, check-in, start, elimination, pause/resume and reveal in an isolated test game/database, including photo upload.
- Check desktop and phone-sized pages, including repeated page changes and controls.
- Change only the chosen game hostname after verification; keep Vercel available for rollback.

Both local workerd and the hosted Worker rejected the direct socket connection to Supabase's pooler. A successful Node connection with `ssl: "require"` does not prove certificate verification: this driver's Node path does not verify the server certificate in that mode. Validate the Hyperdrive connection on the hosted Worker before domain cutover.


## Current preview and verification record

The parallel preview is [secret-mission.chinniradhika98.workers.dev](https://secret-mission.chinniradhika98.workers.dev). It was deployed through the authorized local Cloudflare CLI; GitHub deployment automation still needs its dedicated repository token. The previously verified deployment version was `0b547756-b278-4a22-b1ee-1178fa5b40b6`. This is a historical verification record, not a claim that the current branch head is deployed.

The preview contains the earlier hosting migration and integrated game code. The private inbox in [PR #3](https://github.com/nwokoloafam/secret-mission/pull/3) and optional email extension in [PR #4](https://github.com/nwokoloafam/secret-mission/pull/4) are not deployed there. The notification migration has not been applied to production, and no email scheduler or live email delivery has been activated. Opening the existing preview verifies the hosting path, not the new notification feature. The primary domain remains on Vercel. A fresh HTTP check on November 21, 2026 found the signup form, no email-consent text, and no server-error marker.

For a review, distinguish three checks: automated tests/builds for the PR commit, the version actually deployed to the preview, and a complete isolated gameplay rehearsal. A successful signup-page smoke check does not prove photo uploads, eliminations, private updates, or real-phone interaction performance.

## Optional email scheduler infrastructure

The inbox and migration 0003 belong to PR #3. The email endpoint, provider integration, and separate migration 0004 belong to deferred PR #4. The Cloudflare runtime bindings and independent scheduler belong to this hosting PR. This branch can build without either application PR, but **do not deploy or activate the scheduler until the notification endpoint and migration are available and verified**.

The website's notification bindings default to `NOTIFICATIONS_ENABLED=false` and `EMAIL_MODE=off`. GitHub deployment passes the nonsecret repository variables `NOTIFICATIONS_ENABLED`, `EMAIL_MODE`, `EMAIL_APP_URL`, `EMAIL_DAILY_LIMIT`, and `EMAIL_FROM`. Keep manual deployments consistent with them. Configure `EMAIL_DISPATCH_SECRET` as a runtime secret only when email preview/live mode is enabled; live mode also requires the runtime `BREVO_API_KEY` secret. Do not store those values in source or public variables. Use one canonical game origin for `EMAIL_APP_URL`.

A separate Worker lives in `workers/email-scheduler/`:

```sh
npm run build:email-scheduler
# After provisioning the scheduler's EMAIL_DISPATCH_SECRET:
EMAIL_APP_URL=https://secret-mission.chinniradhika98.workers.dev npm run deploy:email-scheduler
```

Its own configuration, output folder, and explicit Worker name prevent overwriting the website. A minute cron calls up to three bounded batches on the authenticated application endpoint. For first setup, supply the dispatch secret through the CLI's secrets-file option from an ignored/private file or the Cloudflare dashboard; it must match the website secret. The scheduler only needs that dispatch secret, never database or Brevo credentials. CI builds and tests it but does not deploy it. Initial provisioning and every scheduler update require a separate deployment.

The scheduler is currently unprovisioned and inactive. Enabling optional email requires the application migration and configuration, a verified Brevo sender, and an explicitly opted-in real-recipient test. Provider acceptance does not prove inbox delivery. Keep Vercel and Cloudflare application versions/settings aligned because both write to the shared database.
