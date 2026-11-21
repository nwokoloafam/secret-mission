import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

const databaseDirectory = fileURLToPath(new URL("./src/lib/db/", import.meta.url));
const workerDatabaseClient = fileURLToPath(new URL("./src/lib/db/client.cloudflare.ts", import.meta.url));

export default defineConfig({
  resolve: {
    // Vite's alias resolver runs before vinext's tsconfig path resolution.
    // A resolveId hook alone can miss the @/ import used by Server Actions.
    alias: [{ find: "@/lib/db/client", replacement: workerDatabaseClient }],
  },
  plugins: [
    {
      name: "secret-mission-worker-database",
      enforce: "pre",
      resolveId(source, importer) {
        // Keep Next/Vercel's connection pool unchanged. Workers socket ownership
        // requires a separate request-scoped adapter for every DB import form.
        if (source === "@/lib/db/client" || source === `${databaseDirectory}client.ts` || source === `${databaseDirectory}client` ||
            (source === "./client" && importer?.startsWith(databaseDirectory))) {
          return workerDatabaseClient;
        }
      },
    },
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
});
