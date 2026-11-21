-- Apply only AFTER deploying the inbox-only application and disabling email
-- on all hosts. Intentionally deletes optional email addresses and queue data.
-- Games, players, missions, events and player_notifications are preserved.
drop table if exists email_outbox;
drop table if exists email_dispatch_control;
alter table players drop column if exists email;
alter table players drop column if exists email_opt_in;
alter table players drop column if exists email_consent_at;
