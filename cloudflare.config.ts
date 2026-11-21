import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  accountId: "67c9248fdc6f54cf6904a83dac7d990d",
  worker: defineWorker({
    name: "secret-mission",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-12",
    // Enable only after the DNS zone is active in this account and the old
    // game CNAME is removed. Preview/testing deployments keep workers.dev.
    domains: process.env.CLOUDFLARE_ENABLE_CUSTOM_DOMAIN === "true"
      ? ["game.afamnwokolo.com"]
      : [],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      HYPERDRIVE: bindings.hyperdrive({
        id: "a5f366fe1341478894a2230e322009b6",
        dev: {
          connectionString: process.env.LOCAL_DATABASE_URL ??
            "postgres://postgres:postgres@127.0.0.1:54322/postgres",
        },
      }),
      DATABASE_URL: bindings.secret(),
      SUPABASE_URL: bindings.secret(),
      SUPABASE_SERVICE_ROLE_KEY: bindings.secret(),
      NOTIFICATIONS_ENABLED: bindings.json(process.env.NOTIFICATIONS_ENABLED ?? "false"),
      EMAIL_MODE: bindings.json(process.env.EMAIL_MODE ?? "off"),
      EMAIL_APP_URL: bindings.json(process.env.EMAIL_APP_URL ?? "https://secret-mission.chinniradhika98.workers.dev"),
      EMAIL_DAILY_LIMIT: bindings.json(process.env.EMAIL_DAILY_LIMIT ?? "250"),
      EMAIL_FROM: bindings.json(process.env.EMAIL_FROM ?? ""),
      EMAIL_DISPATCH_SECRET: process.env.EMAIL_MODE === "live" || process.env.EMAIL_MODE === "dry-run" ? bindings.secret() : undefined,
      BREVO_API_KEY: process.env.EMAIL_MODE === "live" ? bindings.secret() : undefined,
    },
  }),
});
