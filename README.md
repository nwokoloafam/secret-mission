# Secret Mission

Assassin-style party game for Afam's 31st, played from a mobile website.
Design notes and decided rules live in [`background-info/`](background-info/README.md).

## How it's put together

| Piece | What it does |
|---|---|
| `src/lib/game/` | **The game engine.** Every rule (kills, accusations, hints, late joins, pause...) as plain functions with no database. Fully tested. |
| `src/lib/db/` | Loads a game from the database, runs one engine action, saves the result in one transaction. |
| `src/app/` | The website (Next.js). |
| `supabase/migrations/` | Database tables. |
| `supabase/seed/missions.sql` | Missions, generated from `background-info/missions/missions.md`. |
| `scripts/missions-to-sql.ts` | The generator. |

Hosting: Vercel (auto-deploys `main`). Database and photos: Supabase.

## Setup (one time)

1. **Database tables:** Supabase → SQL Editor → New query → paste `supabase/migrations/0001_init.sql` → Run.
2. **Missions:** same place, paste `supabase/seed/missions.sql` → Run.
3. **Vercel environment variables:** Vercel → project → Settings → Environment Variables. Add the three names from `.env.example` with values from Supabase. Redeploy after adding them.

## Updating missions

1. Edit `background-info/missions/missions.md`.
2. Run `npm run seed:missions` (regenerates `supabase/seed/missions.sql`).
3. Paste that file into the Supabase SQL Editor and run it. Existing missions are updated, new ones added, nothing is deleted.

Later, missions will also be editable from the admin page during the game.

## Running locally (optional)

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
npm test                     # game engine tests
```
