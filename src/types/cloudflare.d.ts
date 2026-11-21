// Only the runtime bindings used by this app. The standard Next.js build keeps
// using src/lib/db/client.ts; Vite selects the Workers adapter.
declare module "cloudflare:workers" {
  export const env: {
    HYPERDRIVE?: { connectionString: string };
  };
}
