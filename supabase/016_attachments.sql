-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- Record-level file attachments (floor plans, PDFs, spec sheets) alongside the
-- per-location photos. Stored as [{path, name, size, type}].
--
-- Files live in the existing survey-photos bucket under an "attachments/"
-- prefix — the bucket's policies are keyed on the bucket, not the file type,
-- so anyone can upload (engineers have no account) and only authenticated
-- users can read them back. No storage changes needed.

alter table surveys add column if not exists attachments jsonb not null default '[]';
alter table installations add column if not exists attachments jsonb not null default '[]';
