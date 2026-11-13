-- Safety net so a stuck query or half-finished transaction can never freeze the game.
-- Run once in Supabase → SQL Editor. Safe to re-run.

-- 1. Clear anything stuck right now.
select pg_terminate_backend(pid)
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid()
  and usename = 'postgres'
  and (
    state in ('idle in transaction', 'idle in transaction (aborted)')
    or (state = 'active' and now() - query_start > interval '2 minutes')
  );

-- 2. From now on, end runaway queries and abandoned transactions automatically.
alter role postgres set statement_timeout = '30s';
alter role postgres set idle_in_transaction_session_timeout = '30s';
