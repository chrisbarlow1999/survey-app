-- Run this once in Supabase → SQL Editor, after 052.
--
-- Per-person settings that should follow someone across devices — starting
-- with which columns they see, in what order, on Projects → Table. One row per
-- account; `prefs` is a small JSON object, e.g.
--   { "projectTableColumns": ["client", "stage", "install", "installTeam"] }
--
-- Everyone can only read and write their own row. Until this has run, the
-- Table view simply shows its default columns and the Columns button can't save.

create table if not exists user_preferences (
  profile_id uuid primary key references profiles(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) <= 16000),
  updated_at timestamptz not null default now()
);

alter table user_preferences enable row level security;

drop policy if exists "Read own preferences" on user_preferences;
create policy "Read own preferences"
  on user_preferences for select
  using (profile_id = auth.uid());

drop policy if exists "Create own preferences" on user_preferences;
create policy "Create own preferences"
  on user_preferences for insert
  with check (profile_id = auth.uid());

drop policy if exists "Update own preferences" on user_preferences;
create policy "Update own preferences"
  on user_preferences for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "Delete own preferences" on user_preferences;
create policy "Delete own preferences"
  on user_preferences for delete
  using (profile_id = auth.uid());

grant select, insert, update, delete on user_preferences to authenticated;
