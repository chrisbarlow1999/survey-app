-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- A third record type: engineer visits (callouts / repairs). An engineer attends
-- site, records one or more issues — each with a photo of the problem, what they
-- did, and a photo of the screen working — and signs it off themselves.
--
-- Deliberately NOT linked to a survey or an install (same reasoning as 010:
-- different companies often do each job). Same access model as the other two
-- tables, written here in its final shape rather than the 010→011→015→016
-- accretion those went through.

create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  engineer_first text not null,
  engineer_last text not null,
  phone text not null,
  visit_date date not null,
  site_location text not null,
  client_id uuid references clients(id),
  address text,
  site_contact text,
  issues jsonb not null default '[]',
    -- [{title, problem_photo_path, fix, working_photo_path, resolved}]
  additional_info text,
  attachments jsonb not null default '[]',
  edit_history jsonb not null default '[]',
  signature_path text,  -- the attending ENGINEER's own signature, not a site sign-off
  submitted_at timestamptz default now(),
  archived_at timestamptz
);

alter table visits enable row level security;

-- Postgres has no "create policy if not exists", so each is dropped first to
-- keep this migration re-runnable (same approach as 013).

drop policy if exists "Anyone can submit a visit" on visits;
create policy "Anyone can submit a visit"
  on visits for insert
  with check (true);

drop policy if exists "Users can view visits in their permitted client groups" on visits;
create policy "Users can view visits in their permitted client groups"
  on visits for select
  using (public.is_super_admin() or public.has_client_access(client_id));

-- is_internal_staff() is what stops a client_viewer editing or deleting, even
-- though they can view their own client's records.
drop policy if exists "Internal staff can update visits in their permitted client groups" on visits;
create policy "Internal staff can update visits in their permitted client groups"
  on visits for update
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)))
  with check (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

drop policy if exists "Internal staff can delete visits in their permitted client groups" on visits;
create policy "Internal staff can delete visits in their permitted client groups"
  on visits for delete
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

create index if not exists visits_archived_at_idx on visits (archived_at);

-- Photos, the engineer signature and attachments all reuse the existing
-- survey-photos bucket (root / signatures/ / attachments/). Its policies are
-- keyed on bucket_id, not on which table references the path, so there are no
-- storage changes needed.
