// Disposable local rehearsal only. Never point this at Supabase or a shared DB.
import postgres from "postgres";
import { readFile } from "node:fs/promises";

const url = new URL(process.env.PREVIEW_DATABASE_URL ?? "postgres://postgres@127.0.0.1:55439/secret_mission_notifications_preview");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/secret_mission_notifications_preview" || url.search) {
  throw new Error("Use the exact disposable local preview database.");
}
const sql = postgres(url.href, { ssl: false, max: 1 });
try {
  const [existing] = await sql`select to_regclass('public.games') as name`;
  if (!existing.name) {
    await sql`create schema if not exists storage`;
    await sql`create table if not exists storage.buckets (id text primary key, name text, public boolean)`;
    for (const file of ["supabase/migrations/0001_init.sql", "supabase/migrations/0003_notifications.sql", "supabase/seed/missions.sql"]) {
      await sql.unsafe(await readFile(new URL(`../${file}`, import.meta.url), "utf8"));
    }
  }
  const [game] = await sql`insert into games (name, admin_token) values ('Local notification rehearsal', 'rehearsal-host')
    on conflict (admin_token) do update set name = excluded.name returning id`;
  for (const name of ["Alice", "Bob", "Charlie", "Dina", "Eli", "Farah", "Gus", "Hana"]) {
    await sql`insert into players (game_id, token, first_name, how_know_afam, status)
      values (${game.id}, ${`rehearsal-${name.toLowerCase()}`}, ${name}, 'Rehearsal guest', 'checked_in')
      on conflict (token) do nothing`;
  }
  console.log("Local rehearsal ready: /admin/rehearsal-host and /p/rehearsal-alice (also bob, charlie, dina, eli, farah, gus, hana).");
} finally { await sql.end(); }
