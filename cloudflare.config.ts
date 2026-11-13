import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  accountId: "67c9248fdc6f54cf6904a83dac7d990d",
  worker: defineWorker({
    name: "secret-mission",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-12",
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
    },
  }),
});
