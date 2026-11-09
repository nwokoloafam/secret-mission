# Game Logic (draft)

Every action below is one transaction. "Hunter of X" = the alive player whose `target_id` is X.
"New mission" = random active mission (E/M early, any later), not one the player has had before.

## Guards (checked on every player action)
- Game must be `active` (not `setup`, `paused` or `ended`).
- Actor must be `alive`.

## Start game (Afam)
1. Take all `checked_in` players, shuffle.
2. Link them in a loop: player[i].target = player[i+1], last → first.
3. Give each a unique 4-digit code, a new mission, `rerolls_left = 1`.
4. Status → `alive`. Game → `active`, set `started_at` and `target_end_at`.
5. Notify everyone: game started, here's your target.

Needs at least 3 players.

## Submit kill code (player)
Input: killer, entered code.
1. Victim = killer's target. Code must match victim's code. (Wrong code → error, no penalty.)
2. Victim must not be in grace or shield → otherwise "they're protected for X more minutes."
3. Victim → `eliminated`, `out_reason = kill`, `out_by = killer`.
4. Killer.target = victim's old target. Killer gets a new mission. `kill_count += 1`, `last_kill_at = now`.
5. If kill_count hits the bonus threshold → `bonus_accusation_earned = true`.
6. **Late-join queue:** if someone is queued, splice the first one in: killer → newcomer → victim's old target. Newcomer gets grace.
7. Prompt killer for a one-line kill story (optional, saved on the event).
8. If 1 alive → end game.
9. Notify: victim (eliminated), killer (new target).

## Accuse (player)
Input: accuser, suspect.
1. Accuser must have an accusation left: `accusations_used < 1 + bonus_accusation_earned`.
2. `accusations_used += 1`.
3. **Correct** (suspect is hunter of accuser):
   - Hunter → `eliminated`, `out_reason = accusation`, `out_by = accuser`.
   - Hunter's hunter now targets accuser, gets a new mission.
   - Accuser: `kill_count += 1`, `last_kill_at = now`, `shield_until = now + shield_minutes`. Check bonus threshold.
   - If 1 alive → end game.
4. **Wrong:** send the next hint tier about the accuser to their hunter (see Hints).

Shield blocks kill codes only, not accusations.
Edge case: with 2 alive, each hunts the other, so a correct accusation wins the game.

## Hints
Tiers, in order: group → outfit → custom → initial.
1. Start at the about-player's `hint_tier_revealed`.
2. Skip a tier if its data is missing, or if it matches too many alive players (e.g. more than half).
3. Send it, increment `hint_tier_revealed`.
4. If all tiers are used up, send nothing (the penalty just stops escalating).

Afam can also send a player's custom hint (or any free text) to their hunter manually.

## Reroll (player)
`rerolls_left > 0` → new mission, `rerolls_left -= 1`.

## Skip mission (Afam)
Give the player a new mission. No limit.

## Check-in and late join
- Before start: `registered` → `checked_in`.
- After start, before the join cutoff: → `queued`. Spliced in at the next kill (above).
- **Fallback:** if a queued player has waited `splice_fallback_minutes` with no kill, splice them in at a random spot: pick random alive A, then A → newcomer → A's old target. A gets a new mission and a notification.
- After the cutoff (`alive ≤ join_cutoff_players` or `join_cutoff_minutes` since start): no joining; they become ghosts.

## Remove / leave
Triggered by Afam's **Remove** or the player's **I'm leaving** button (which also pings Afam).
1. Player → `left`, `out_reason = removed` or `left`.
2. Hunter of player targets the player's old target, gets a new mission.
3. No kill credit. If 1 alive → end game.

If the player was `queued`, just take them out of the queue.

## Move (Afam)
Input: player X, optional "keep away from" Y.
1. Remove X from the loop (as above, minus the status change).
2. Splice X back in at a random spot where X's new target isn't Y and Y isn't X's new hunter.
3. X and their new hunter get new missions and notifications.

## Pause / resume (Afam)
- Pause: status → `paused`, `paused_at = now`. All player actions are rejected. Banner on every screen.
- Resume: shift `target_end_at`, every `grace_until`, `shield_until`, and `queued_at` forward by the pause length. Status → `active`.

## End time
- Afam can change `target_end_at` (extend) or end now.
- When `now ≥ target_end_at`, the game ends.

## End game
1. Status → `ended`.
2. Winner = alive player with the most kills. Tiebreak: earliest `last_kill_at`. If all survivors have 0 kills, Afam picks.
3. Reveal shows: winner, full kill chain from the event log, kill counts, kill stories, who left early, betting pool winners.

## Disputes
- Killer taps **Disputed** (e.g. target won't hand over the code) → open dispute, pings Afam.
- Upheld: Afam force-eliminates the target as if the code was entered (same steps as a kill).
- Rejected: nothing changes.

## Ghost actions
- **Bet:** set `bet_on_id` once, before the end.
- **Poltergeist:** once per ghost, send a hint (free text) to any alive player. Shown as anonymous.

## Timers without a server clock
Vercel's free tier has no frequent background jobs, so timed things (splice fallback, end time, grace expiring) run **lazily**: a `tick` function checks and applies anything due. It runs:
- on every game action, and
- every ~30 seconds from Afam's admin page while it's open.

## Notifications
Pushed live to open pages via Supabase Realtime; SMS for opted-in players on the must-have events.
In silent-final mode, the last 2 aren't told they're the final 2.
