# Cloudflare deployment

This branch adds a Cloudflare Workers deployment alongside the existing Next.js / Vercel deployment. It does not change DNS, game rules, page design, or the database schema. Afam can keep working on the application and the existing `npm run dev` / `npm run build` commands.

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
npm test                    # engine + Workers connection-lifecycle checks
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

`.github/workflows/checks.yml` runs tests, TypeScript, the Cloudflare build, and the original Next build on pull requests and relevant pushes. On `main`, the **Deploy to Cloudflare** job runs only after those checks pass. A manual run on `main` also deploys. PRs and the migration branch never deploy production or receive the deployment token.

Before merging, add a dedicated Cloudflare API token as the GitHub repository Actions secret **`CLOUDFLARE_API_TOKEN`**. Use Workers Scripts Edit for this Cloudflare account; domain cutover additionally needs Zone Read and Workers Routes Edit scoped to `afamnwokolo.com`. Existing Hyperdrive bindings do not require a separate Hyperdrive provisioning permission. Do not grant certificate-management permission to CI. Runtime database/photo secrets remain in Cloudflare; do not copy them to GitHub or expose them as `NEXT_PUBLIC_`/`VITE_` variables. The deployment preserves the already configured remote secrets. Do not use a personal CLI OAuth token as the CI secret.

The job deploys the built Worker with automatic resource provisioning disabled and checks that its database-backed signup page responds correctly. When domain cutover is enabled, it checks the main-domain signup page too. This is a deployment smoke check, not a full game rehearsal. Keep Cloudflare's separate native Builds integration disconnected to avoid duplicate deployments.

## Retire Vercel automatic deployment

`vercel.json` sets `git.deploymentEnabled` to `false`. This disables automatic Git deployments for this migration and, once merged, main. It does not delete the existing Vercel deployment or move DNS. The current Vercel site remains available as the rollback target.

Vercel may still report the private-repository author-permission failure before it reads this branch's configuration; existing failed statuses are not rewritten. If checks keep appearing, the Vercel project owner should use **Project → Settings → Git → Connected Git Repository → Disconnect** for this project. Do not delete the project or remove the Vercel GitHub app from unrelated repositories. Remove a required Vercel status check from branch rules only if one is configured, replacing it with the actual application check. Repository rules are unavailable on the current private-repository plan; none were changed by this migration.

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
