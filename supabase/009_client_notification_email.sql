-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- Lets each client have a notification inbox (e.g. a team's shared mailbox) that
-- gets emailed whenever an engineer submits a survey for that client.

alter table clients add column if not exists notification_email text;
