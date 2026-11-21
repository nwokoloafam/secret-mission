import postgres from "postgres";
import { env } from "cloudflare:workers";
import { cache } from "react";
import { after } from "next/server";

// Callers doing background work own cleanup of this independent client. It must
// not share the request client's concurrent after() cleanup.
export function openDb(): postgres.Sql {
  const hyperdrive = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
  const url = hyperdrive?.connectionString ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See README → Setup.");

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  return postgres(url, hyperdrive ? {
    // Hyperdrive supplies a managed local proxy; it secures the origin link.
    ssl: false,
    max: 5,
    prepare: true,
    connect_timeout: 10,
  } : {
    ssl: local ? false : "require",
    max: 1,
    prepare: false,
    // Supavisor transaction pooling can stall when queries are pipelined.
    // One in-flight query also preserves sql.begin(); zero does not.
    max_pipeline: 1,
    connect_timeout: 10,
  });

}

// Workers sockets belong to the request that opened them. React shares this
// client during a Server Component render; outside a render (such as an action),
// each call creates a client and registers its own cleanup.
export const db = cache(function createRequestClient(): postgres.Sql {
  const sql = openDb();
  // after() runs after the response, including redirects and thrown errors, and
  // keeps cleanup alive through the Workers execution context's waitUntil.
  after(() => sql.end({ timeout: 5 }));
  return sql;
});
