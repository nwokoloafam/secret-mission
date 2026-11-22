# Plan Overview

Summary of the original plan doc ("Secret Mission Game — 30th Birthday Plan", Nov 5, 2026).
**Correction:** it's Afam's **31st** birthday, not 30th.

## The game
- Assassin-style game at a bar, 20–30 guests, run from a mobile website.
- Each player has a secret target and a mild social mission. Completing it eliminates the target and passes their target to you.
- Missions are low-noise and built to make people mix (get them to say a word, learn their middle name, photo of them holding a spoon). Keep them within the party, except the specific task to start a friendly conversation with another bar patron. A brief, welcome conversation counts; move on if they aren't interested. Never involve bar staff.
- **It's a background game.** It should never pull people away from the party. No crowd voting or spectacle.

## Core mechanics
- **Elimination:** victim hands over their 4-digit code; killer enters it. The handoff is consent, so no second confirm.
- **Inheritance:** killer instantly gets the victim's target and a new mission.
- **House rule:** when caught, hand over your code. No arguing; the host settles disputes.

## Player flow
1. Game link in the Partiful invite. Sign-up: first name, photo, how they know Afam, optional "text me updates" + phone.
2. Day-of Partiful blast: update your photo with tonight's outfit, in good light.
3. At the bar: tap **I'm here** (QR card on tables or AirDropped link). Afam adds walk-ins from his phone.
4. Afam hits **Start** once most people arrive. Only checked-in players get targets.

## Target card
Target's photo, first name, how they know Afam; current mission; your own code; kill-code box; **Can't find them** button (pings Afam).

## Loop management
- Targets form one loop. Late players are spliced in, leavers spliced out, no restart.
- **Splice:** if A hunts B, newcomer N goes between: A hunts N, N hunts B.
- **Splice on kills:** late arrivals queue. At the next kill, the killer gets the newcomer and the newcomer gets the victim's old target.
- **Fallback:** no kill within ~5 min → splice at a random spot, notify the one affected player.
- **Grace period:** newcomers can't be eliminated for 10–15 min.
- **Join cutoff:** ~5 players left or 90 min in. Later arrivals get side roles.
- **Leavers:** Afam removes them; their hunter inherits their target.
- **Disputes:** killer taps **Disputed**, pings Afam, who rules from admin.

## Visibility
| When | Shown | Hidden |
|---|---|---|
| During | Agents remaining; eliminated names (no killers) | Who killed whom; kill counts |
| End | Full kill chain, kill counts, winner, best kill story | Nothing |

End reveal works on phones or a TV at the bar.

## Notifications
- Opt-in SMS via Twilio (~$0.01/text) plus live site updates.
- Must-have: game started, new target, eliminated, game over.
- Nice-to-have: grace period over, final 3–5, host broadcasts.
- Skip: texting everyone on every kill.
- US SMS needs A2P 10DLC or toll-free verification (days to 2 weeks). Backup: Partiful blasts.

## Admin (Afam's phone)
Start/end, add/remove players, reassign targets, skip missions, rule disputes, broadcasts, full live chain.

## Tech
- Mobile website. Personal links (`/p/x7k2`), no passwords.
- Pages: sign-up, player page, admin, end reveal.
- Supabase (dev + prod, free) for DB, photos, live updates. Vercel (free) auto-deploys from main. Twilio for texts.
- Domain: subdomain like `game.afamnwokolo.com` via one CNAME.
- Branches + PRs, Vercel preview URLs, quick review before merge.
- Secrets in Vercel env vars and a gitignored `.env`; share via password manager.
- Estimate: 1–2 focused days, then a test run with 4–5 friends.
