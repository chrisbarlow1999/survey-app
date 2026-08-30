-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- Adds a readable "active" flag mirrored onto profiles. The actual enforcement
-- (blocking sign-in) happens via Supabase Auth's own ban_duration, set by the
-- admin-toggle-active API route using the service role key — this column is
-- just so the admin UI can display current status without needing service-role
-- access on every page load.

alter table profiles add column if not exists active boolean not null default true;
