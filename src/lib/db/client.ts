import postgres from "postgres";

// One shared connection pool, created on first use so the build doesn't need
// DATABASE_URL. Use Supabase's "Transaction pooler" connection string (port 6543).
let _sql: postgres.Sql | null = null;

export function db(): postgres.Sql {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See README → Setup.");
  _sql = postgres(url, {
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
    max: 5,
    idle_timeout: 20,
  });
  return _sql;
}
