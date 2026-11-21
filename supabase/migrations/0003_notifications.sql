create table if not exists player_notifications (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  kind text not null, message text not null,
  created_at timestamptz not null default now(), read_at timestamptz
);
create index if not exists player_notifications_inbox on player_notifications(player_id, created_at desc);
alter table player_notifications enable row level security;
