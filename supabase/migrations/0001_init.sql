-- Secret Mission: initial schema.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste this file → Run.
-- Design reference: background-info/design/data-model.md

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- missions: shared across games, edited from admin
-- ─────────────────────────────────────────────
create table missions (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  difficulty  text not null default 'M' check (difficulty in ('E', 'M', 'H')),
  category    text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
-- Lets the missions.md seed be re-run without creating duplicates.
create unique index missions_text_unique on missions (text);

-- ─────────────────────────────────────────────
-- games: one row per game (test run, real party, ...)
-- ─────────────────────────────────────────────
create table games (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  status         text not null default 'setup'
                 check (status in ('setup', 'active', 'paused', 'ended')),
  admin_token    text not null unique,
  started_at     timestamptz,
  target_end_at  timestamptz,
  paused_at      timestamptz,
  ended_at       timestamptz,
  winner_id      uuid,
  settings       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- players
-- ─────────────────────────────────────────────
create table players (
  id                       uuid primary key default gen_random_uuid(),
  game_id                  uuid not null references games (id) on delete cascade,
  token                    text not null unique,
  first_name               text not null,
  photo_url                text,
  how_know_afam            text,
  phone                    text,
  sms_opt_in               boolean not null default false,
  top_color                text,
  accessory                text,
  custom_hint              text,
  status                   text not null default 'registered'
                           check (status in ('registered', 'checked_in', 'queued', 'alive', 'eliminated', 'left')),
  code                     char(4),
  target_id                uuid references players (id),
  mission_id               uuid references missions (id),
  missions_seen            uuid[] not null default '{}',
  rerolls_left             int not null default 1,
  accusations_used         int not null default 0,
  bonus_accusation_earned  boolean not null default false,
  kill_count               int not null default 0,
  last_kill_at             timestamptz,
  hint_tier_revealed       int not null default 0,
  grace_until              timestamptz,
  shield_until             timestamptz,
  checked_in_at            timestamptz,
  queued_at                timestamptz,
  out_at                   timestamptz,
  out_reason               text check (out_reason in ('kill', 'accusation', 'removed', 'left')),
  out_by                   uuid references players (id),
  bet_on_id                uuid references players (id),
  poltergeist_used         boolean not null default false,
  created_at               timestamptz not null default now()
);
create index players_game_idx on players (game_id);
create unique index players_code_per_game on players (game_id, code) where code is not null;

alter table games
  add constraint games_winner_fk foreign key (winner_id) references players (id);

-- ─────────────────────────────────────────────
-- hints
-- ─────────────────────────────────────────────
create table hints (
  id               uuid primary key default gen_random_uuid(),
  game_id          uuid not null references games (id) on delete cascade,
  to_player_id     uuid not null references players (id) on delete cascade,
  about_player_id  uuid references players (id) on delete cascade,
  source           text not null
                   check (source in ('group', 'outfit', 'custom', 'initial', 'poltergeist', 'host')),
  text             text not null,
  created_at       timestamptz not null default now()
);
create index hints_to_idx on hints (to_player_id);

-- ─────────────────────────────────────────────
-- events: append-only log (end reveal, admin feed, debugging)
-- ─────────────────────────────────────────────
create table events (
  id          bigint generated always as identity primary key,
  game_id     uuid not null references games (id) on delete cascade,
  type        text not null,
  actor_id    uuid references players (id) on delete set null,
  subject_id  uuid references players (id) on delete set null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index events_game_idx on events (game_id, id);

-- ─────────────────────────────────────────────
-- disputes
-- ─────────────────────────────────────────────
create table disputes (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references games (id) on delete cascade,
  raised_by   uuid not null references players (id) on delete cascade,
  against     uuid not null references players (id) on delete cascade,
  note        text,
  status      text not null default 'open' check (status in ('open', 'upheld', 'rejected')),
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- Security: the website talks to the database from the server only,
-- using the private connection string. Turning on row-level security
-- with no policies blocks the public API keys from reading anything.
-- ─────────────────────────────────────────────
alter table missions enable row level security;
alter table games    enable row level security;
alter table players  enable row level security;
alter table hints    enable row level security;
alter table events   enable row level security;
alter table disputes enable row level security;

-- ─────────────────────────────────────────────
-- Photo storage bucket. Public read so <img> tags work;
-- file names are random, and uploads go through the server only.
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;
