# Cloudflare deployment

This branch adds a Cloudflare Workers deployment alongside the existing Next.js / Vercel deployment. It does not change DNS, game rules, page design, or the database schema. Afam can keep working on the application and the existing `npm run dev` / `npm run build` commands.

## Local prerequisites

Use Node 24.22+ (the version in `.nvmrc`); the new Cloudflare CLI requires a more recent Node patch than the original project. Run `npm ci`.

Copy `.dev.vars.example` to `.dev.vars` and fill in the three values. This file is gitignored. Use Supabase's **transaction pooler** connection string, port 6543, with its password URL-encoded. Keep real values out of Git and build configuration.

- `DATABASE_URL`: server-only Postgres connection string.
- `SUPABASE_URL`: the existing project's API URL.
- `SUPABASE_SERVICE_ROLE_KEY`: existing server-only secret key, used for photo uploads.

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

Cloudflare sockets belong to the request that creates them. `vite.config.ts` maps the normal database client to `client.cloudflare.ts` in the Worker build only. That adapter shares a connection during a React server render, opens independent clients for calls outside that render, and closes every created client after the response. It disables prepared statements and pipelining beyond one query for the Supabase transaction pooler. The existing Next/Vercel client is unchanged.

## Accounts and deployment

The Worker is named `secret-mission` in Radhika's Cloudflare account. Deploy to its `workers.dev` URL first. Keep the existing Vercel deployment and domain unchanged until the Worker has been verified.

Register a free account-level `workers.dev` subdomain once in Cloudflare Workers onboarding.

Authenticate with `npx cf auth login --scopes account:read user:read workers:write workers_scripts:write`. Secret values are supplied to Cloudflare at runtime, not embedded in builds. A browser login alone does not authenticate the local CLI.

To share management access: Cloudflare **Manage account → Members → Invite members**. A **Super Administrator – All Privileges** member has full control of the whole account, including billing and other members. Each person uses their own login. Choose a narrower Workers role when full account control is not intended.

## GitHub checks and ongoing deployment

`.github/workflows/checks.yml` runs tests, TypeScript, the Cloudflare build, and the original Next build on pull requests and relevant pushes. It requires no production secrets and does not deploy automatically.

For automatic Cloudflare deployments, connect this GitHub repository in the Worker's Builds settings after the first verified deployment. Use `npm run build:cloudflare` as the build command and `npx cf deploy --prebuilt` as the deploy command, with Node 24.22+ selected. The GitHub app may require the repository owner's approval for access to this private repository. Do not connect `main` until this migration branch is merged and ready; do not expose runtime secrets as `NEXT_PUBLIC_` or `VITE_` values.

## Verification before domain cutover

- Both builds, TypeScript, and engine/adapter tests pass.
- The Worker bundle resolves all database imports to the request-scoped adapter.
- Test actual hosted home/join/player/admin pages and repeated database reads.
- Rehearse signup, check-in, start, elimination, pause/resume and reveal in an isolated test game/database, including photo upload.
- Check desktop and phone-sized pages, including repeated page changes and controls.
- Change only the chosen game hostname after verification; keep Vercel available for rollback.

Local workerd on this Mac has rejected the Supabase pooler certificate with Apple error -67901 (certificate validity period). Node's connection succeeds. Do not disable certificate validation; validate the hosted Workers connection separately.
