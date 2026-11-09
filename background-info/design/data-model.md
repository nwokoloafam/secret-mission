# Data Model (draft)

Postgres on Supabase. Assumes Next.js on Vercel calling Postgres functions for game actions, so every action runs as one transaction.

Internal names are plain ("kill", "target"); themed copy ("visa denied") lives in the UI text file only.

## games
One row per game (lets you do a test run, then the real one).

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | |
| status | enum | `setup`, `active`, `paused`, `ended` |
| admin_token | text | Afam's secret admin link |
| started_at | timestamptz | |
| target_end_at | timestamptz | Shown to players; Afam can change it |
| paused_at | timestamptz | Set while paused |
| ended_at | timestamptz | |
| winner_id | uuid → players | |
| settings | jsonb | See below |

`settings` (all adjustable): `grace_minutes` (10), `shield_minutes` (10), `bonus_accusation_at_kills` (3), `splice_fallback_minutes` (5), `join_cutoff_players` (5), `join_cutoff_minutes` (90), `silent_final` (false).

## players
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| game_id | uuid → games | |
| token | text | Personal link `/p/<token>`, random, ~8 chars |
| first_name | text | |
| photo_url | text | Supabase storage |
| how_know_afam | text | Also the "group" hint |
| phone | text | Only if texts opted in |
| sms_opt_in | bool | |
| top_color | text | Check-in tap, for hints |
| accessory | text | Check-in tap, for hints |
| custom_hint | text | Written by Afam |
| status | enum | `registered`, `checked_in`, `queued`, `alive`, `eliminated`, `left` |
| code | char(4) | Unique within the game |
| target_id | uuid → players | **The loop.** Each alive player points to who they hunt |
| mission_id | uuid → missions | Current mission |
| rerolls_left | int | Starts at 1 |
| accusations_used | int | |
| bonus_accusation_earned | bool | Set when kills reach the threshold |
| kill_count | int | Includes correct accusations |
| last_kill_at | timestamptz | Tiebreak: who reached their count first |
| hint_tier_revealed | int | How many hint tiers about this player have gone out |
| grace_until | timestamptz | Late joiners |
| shield_until | timestamptz | After a correct accusation |
| checked_in_at | timestamptz | |
| queued_at | timestamptz | Late join queue order |
| out_at | timestamptz | Eliminated or left |
| out_reason | enum | `kill`, `accusation`, `removed`, `left` |
| out_by | uuid → players | Null for removed/left |
| bet_on_id | uuid → players | Ghost betting pool |
| poltergeist_used | bool | |

**Loop invariant:** following `target_id` from any alive player visits every alive player exactly once and comes back. Every action below keeps this true.

## missions
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| text | text | |
| difficulty | enum | `E`, `M`, `H` |
| category | text | Optional |
| active | bool | Off = never handed out again |
| created_at | timestamptz | |

Shared across games. Seeded from `missions/missions.md`, then edited in admin.

## hints
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| game_id | uuid | |
| to_player_id | uuid | Who receives it |
| about_player_id | uuid | Who it describes (null for free-text poltergeist) |
| source | enum | `group`, `outfit`, `custom`, `initial`, `poltergeist`, `host` |
| text | text | |
| created_at | timestamptz | |

Hints show on the receiver's card while `about_player_id` is still their target.

## events
Append-only log of everything. Drives the end reveal (kill chain), the admin feed, and debugging.

| Column | Type | Notes |
|---|---|---|
| id | bigint | |
| game_id | uuid | |
| type | text | `start`, `kill`, `accuse_right`, `accuse_wrong`, `remove`, `leave`, `move`, `splice`, `reroll`, `skip`, `pause`, `resume`, `extend`, `end`, `hint`, `broadcast`, `dispute`, `dispute_resolved`, `mission_added` |
| actor_id | uuid | Who did it (null = Afam/system) |
| subject_id | uuid | Who it happened to |
| data | jsonb | e.g. mission text, kill story, dispute note |
| created_at | timestamptz | |

## disputes
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| game_id | uuid | |
| raised_by | uuid | |
| against | uuid | |
| note | text | |
| status | enum | `open`, `upheld`, `rejected` |
| created_at | timestamptz | |
