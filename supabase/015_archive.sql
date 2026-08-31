-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- Soft-delete: archiving hides a record from the default dashboard view without
-- destroying it, so a mistaken removal is recoverable. The existing Delete
-- button stays for genuinely permanent removal.
--
-- No new RLS policies needed — archiving/restoring is just an UPDATE, already
-- covered by the "Internal staff can update ..." policies from migration 013
-- (which also means a client_viewer can't archive anything, same as they
-- can't edit or delete).

alter table surveys add column if not exists archived_at timestamptz;
alter table installations add column if not exists archived_at timestamptz;

create index if not exists surveys_archived_at_idx on surveys (archived_at);
create index if not exists installations_archived_at_idx on installations (archived_at);
