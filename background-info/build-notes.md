# Build Notes

Requirements to remember when building. Not rules of the game; how the platform should work.

## Stack (decided: whatever is easiest, since AI writes the code)
- **Next.js (TypeScript)** for the website: player pages, admin, sign-up, end reveal.
- **Supabase** for the database, photo storage, and live updates. Free tier.
- **Vercel** for hosting. Free tier. Every push to `main` on GitHub goes live automatically; every pull request gets its own preview link.
- **Domain:** `game.afamnwokolo.com` is live on Vercel (CNAME added in WordPress.com DNS, Nov 8). The WordPress site is unaffected. Free link `secret-mission-eight.vercel.app` also works. Another subdomain can be added later if the theme name calls for it.
- Why not Python: a Python backend would need a separate server, and free Python hosts go to sleep when idle (slow first load at the party). Live updates are also harder.
- Why not WordPress: WordPress isn't built for live, game-style apps; it would be slower and harder to build.

## Missions must be easy to change
- Missions live in the **database**, not hardcoded in the app.
- Each mission has: text, difficulty (E/M/H), active on/off, and optional category.
- **Admin page can add, edit, and turn off missions**, including **mid-game** ("add on the spot").
  - New missions go into the pool right away and can be handed out at the next assignment or reroll.
  - Editing a mission someone currently holds: they see the new text right away (decided at build).
  - Turning off a mission doesn't affect players who already hold it; Afam can skip it for them.
- **Iteration path:**
  1. Now: edit `missions/missions.md` by hand.
  2. First build: a seed script reads `missions.md` and loads it into the database.
  3. Later: the admin page is the main editor; maybe export back to markdown for the record.
- Same approach for hints and themed copy where practical: data, not code.

## Theme copy
- Keep all player-facing text (labels, notifications, end reveal) in one place, so the theme can change without touching logic.
- Built: `src/lib/copy.ts`.

## Leavers
- Both backups stay: the "I'm leaving" button and "Can't find them" → Afam removes.

## How it's built (v1, Nov 12)
- **Live updates by polling:** every open page refreshes itself every 5 seconds instead of using Supabase Realtime. Simpler and plenty for ~30 phones.
- **Timers** (end time, late-join splice) run from Afam's admin page every 30s, and from player pages every 60s as a backup, so they still fire if Afam's page is closed.
- **Game creation:** one SQL insert in Supabase (see the repo README). Sign-ups go to the newest game that hasn't ended.
- **Photos** are shrunk on the phone (max 800px) before upload. Photo is optional at sign-up; players without one see a reminder.
- **Join cutoff applies to late arrivals:** with 5 or fewer players alive, late arrivals become spectators (can bet and haunt).
- **Not built yet:** SMS texts (Twilio), host-editable game settings from the admin page.
