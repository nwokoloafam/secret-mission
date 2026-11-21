alter table players add column if not exists email text;
alter table players add column if not exists email_opt_in boolean not null default false;
alter table players add column if not exists email_consent_at timestamptz;

create table if not exists player_notifications (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  kind text not null, message text not null,
  created_at timestamptz not null default now(), read_at timestamptz
);
create index if not exists player_notifications_inbox on player_notifications(player_id, created_at desc);
create table if not exists email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references player_notifications(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  email text not null,
  delivery_mode text not null check (delivery_mode in ('dry-run', 'live')),
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','unknown','expired','suppressed','dry_run')),
  created_at timestamptz not null default now(), attempted_at timestamptz,
  provider_id text, error_code text
);
create index if not exists email_outbox_pending on email_outbox(created_at) where status = 'pending';
create table if not exists email_dispatch_control (
  id integer primary key default 1 check (id = 1), last_attempt_at timestamptz,
  budget_date date not null default current_date, attempts integer not null default 0
);
insert into email_dispatch_control(id) values (1) on conflict do nothing;
alter table player_notifications enable row level security;
alter table email_outbox enable row level security;
alter table email_dispatch_control enable row level security;
