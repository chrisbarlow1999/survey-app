-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- A separate "install confirmation" record type — engineers submit these once an
-- install is finished, as proof (photo + confirmed/not + notes) per screen.
-- Deliberately NOT linked to the original site survey (different engineer
-- companies often do the survey vs. the install), so it's its own table with
-- the exact same access model as surveys: anyone can submit, only accounts
-- with access to that client can view/edit/delete.

create table if not exists installations (
  id uuid primary key default gen_random_uuid(),
  engineer_first text not null,
  engineer_last text not null,
  phone text not null,
  install_date date not null,
  site_location text not null,
  client_id uuid references clients(id),
  address text,
  site_contact text,
  locations jsonb not null default '[]',  -- [{label, photo_path, installed, notes}]
  additional_info text,
  edit_history jsonb not null default '[]',
  submitted_at timestamptz default now()
);

alter table installations enable row level security;

create policy "Anyone can submit an installation"
  on installations for insert
  with check (true);

create policy "Users can view installations in their permitted client groups"
  on installations for select
  using (public.is_super_admin() or public.has_client_access(client_id));

create policy "Users can update installations in their permitted client groups"
  on installations for update
  using (public.is_super_admin() or public.has_client_access(client_id))
  with check (public.is_super_admin() or public.has_client_access(client_id));

create policy "Users can delete installations in their permitted client groups"
  on installations for delete
  using (public.is_super_admin() or public.has_client_access(client_id));

-- Photos reuse the existing survey-photos bucket — its policies (anyone can
-- upload, authenticated can view, super admin can delete) are keyed on the
-- bucket, not which table references the path, so no storage changes needed.
