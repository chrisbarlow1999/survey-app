-- Run this once in Supabase → SQL Editor, after 038.
--
-- Saved spreadsheet layouts, so onboarding a client is a conversation with the
-- import screen rather than a change to the code.
--
-- The reader works a range sheet out from its shape: a block of ticks, labels
-- up the side, outlet names across the top. That guess is right often enough
-- to be useful and wrong often enough to need correcting — which column is the
-- price, which row is the menu tier. A layout records those answers against
-- the client, so every later import of the same sheet is one click.
--
-- WHY THE MAPPING IS JSONB
-- It is read and written whole, by one screen, and never queried across rows.
-- It also has to tolerate new fields as more sheet shapes turn up, without a
-- migration each time.
--
-- WHAT IT DELIBERATELY DOESN'T HOLD
-- Which columns are outlets. Those are found again on every import, so a
-- client who adds a kiosk in a new column doesn't need the layout editing.

create table if not exists menu_import_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  -- What this layout is for, in the importer's words: "Levy range sheet",
  -- "Hospitality tabs".
  name text not null,
  -- The sheet this layout was last used on, only to offer it first next time.
  sheet_hint text,
  mapping jsonb not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists menu_import_profiles_client_id_idx on menu_import_profiles (client_id);
create unique index if not exists menu_import_profiles_name_idx
  on menu_import_profiles (client_id, lower(trim(name)));

alter table menu_import_profiles enable row level security;

drop policy if exists "Internal staff can read import profiles" on menu_import_profiles;
create policy "Internal staff can read import profiles"
  on menu_import_profiles for select
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

drop policy if exists "Internal staff can manage import profiles" on menu_import_profiles;
create policy "Internal staff can manage import profiles"
  on menu_import_profiles for all
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)))
  with check (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));
