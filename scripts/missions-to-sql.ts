// Turns background-info/missions/missions.md into SQL you can paste into the
// Supabase SQL Editor.
//
//   npm run seed:missions            → writes supabase/seed/missions.sql
//
// It reads lines like "12. (E) Learn where they grew up." and the "## Heading"
// above them (used as the category). Re-running is safe: missions that already
// exist (same text) are updated, not duplicated. Missions you've removed from
// the file are NOT deleted; turn them off from the admin page instead.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(root, "background-info/missions/missions.md");
const output = resolve(root, "supabase/seed/missions.sql");

export interface ParsedMission {
  text: string;
  difficulty: "E" | "M" | "H";
  category: string | null;
}

export function parseMissions(md: string): ParsedMission[] {
  const out: ParsedMission[] = [];
  let category: string | null = null;
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      category = heading[1].trim();
      if (/^notes?$/i.test(category)) category = null;
      continue;
    }
    const m = line.match(/^\d+\.\s*\((E|M|H)\)\s*(.+)$/);
    if (m) out.push({ difficulty: m[1] as ParsedMission["difficulty"], text: m[2].trim(), category });
  }
  return out;
}

const q = (s: string | null) => (s === null ? "null" : `'${s.replace(/'/g, "''")}'`);

export function toSql(missions: ParsedMission[]): string {
  const values = missions.map((m) => `  (${q(m.text)}, '${m.difficulty}', ${q(m.category)})`).join(",\n");
  return `-- Generated from background-info/missions/missions.md by: npm run seed:missions
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
insert into missions (text, difficulty, category)
values
${values}
on conflict (text) do update
  set difficulty = excluded.difficulty,
      category = excluded.category;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const missions = parseMissions(readFileSync(input, "utf8"));
  if (missions.length === 0) throw new Error(`No missions found in ${input}`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, toSql(missions));
  console.log(`Wrote ${missions.length} missions to supabase/seed/missions.sql`);
}
