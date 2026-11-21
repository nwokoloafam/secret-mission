import postgres from "postgres";
import { cache } from "react";
import { after } from "next/server";

// One database client per request, closed as soon as the response is sent.
//
// Why not one long-lived pool? Vercel freezes the server between requests.
// Connections left open while frozen get silently cut, and the client then
// waits forever on a dead connection, so pages hang until Vercel kills them
// after 5 minutes. Opening a fresh connection per request avoids that. Use
// Supabase's "Transaction pooler" connection string (port 6543), which is
// built for exactly this.
// Background work must own its connection; the request client's after() cleanup
// runs concurrently with other after() callbacks.
export function openDb(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See README → Setup.");
  return postgres(url, {
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
    max: Number(process.env.DB_POOL_MAX ?? 3),
    // The transaction pooler can't keep prepared statements between requests.
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 10,
  });
}

export const db = cache((): postgres.Sql => {
  const sql = openDb();
  after(() => sql.end({ timeout: 5 }));
  return sql;
});
