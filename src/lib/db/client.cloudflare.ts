import postgres from "postgres";
import { cache } from "react";
import { after } from "next/server";

// Workers sockets belong to the request that opened them. React shares this
// client during a Server Component render; outside a render (such as an action),
// each call creates a client and registers its own cleanup.
export const db = cache(function createRequestClient(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See README → Setup.");

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  const sql = postgres(url, {
    ssl: local ? false : "require",
    max: 1,
    prepare: false,
    // Supavisor transaction pooling can stall when queries are pipelined.
    // One in-flight query also preserves sql.begin(); zero does not.
    max_pipeline: 1,
    connect_timeout: 10,
  });

  // after() runs after the response, including redirects and thrown errors, and
  // keeps cleanup alive through the Workers execution context's waitUntil.
  after(() => sql.end({ timeout: 5 }));
  return sql;
});
