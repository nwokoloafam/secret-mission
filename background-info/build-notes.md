# Build Notes

Requirements to remember when building. Not rules of the game; how the platform should work.

## Stack (decided: whatever is easiest, since AI writes the code)
- **Next.js (TypeScript)** for the website: player pages, admin, sign-up, end reveal.
- **Supabase** for the database, photo storage, and live updates. Free tier.
- **Vercel** for hosting. Free tier. Every push to `main` on GitHub goes live automatically; every pull request gets its own preview link.
- **Domain:** `game.afamnwokolo.com` (or similar) pointed at Vercel with one DNS record. The WordPress site stays as it is.
- Why not Python: a Python backend would need a separate server, and free Python hosts go to sleep when idle (slow first load at the party). Live updates are also harder.
- Why not WordPress: WordPress isn't built for live, game-style apps; it would be slower and harder to build.

## Missions must be easy to change
- Missions live in the **database**, not hardcoded in the app.
- Each mission has: text, difficulty (E/M/H), active on/off, and optional category.
- **Admin page can add, edit, and turn off missions**, including **mid-game** ("add on the spot").
  - New missions go into the pool right away and can be handed out at the next assignment or reroll.
  - Editing a mission someone currently holds: they keep the old text (or Afam can push the update). Decide at build time.
  - Turning off a mission doesn't affect players who already hold it; Afam can skip it for them.
- **Iteration path:**
  1. Now: edit `missions/missions.md` by hand.
  2. First build: a seed script reads `missions.md` and loads it into the database.
  3. Later: the admin page is the main editor; maybe export back to markdown for the record.
- Same approach for hints and themed copy where practical: data, not code.

## Theme copy
- Keep all player-facing text (labels, notifications, end reveal) in one place, so the theme can change without touching logic.

## Leavers
- Both backups stay: the "I'm leaving" button and "Can't find them" → Afam removes.
