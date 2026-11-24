-- Run this once in Supabase → SQL Editor, after 046.
--
-- Sectors within a client. Compass is one client, but Eurest, Levy,
-- Chartwells, Ireland and the rest each run slightly differently and are
-- tracked separately, so a project can now say which part of the client it's
-- for: Compass · Eurest.
--
-- A sector belongs to exactly one client, and a project's sector must belong
-- to the project's own client (enforced by a trigger below, not just the UI).
-- Sectors are optional: a client with none set up — Starbucks, TUI — carries
-- on exactly as before.

-- ============================================================
-- 1. Sectors
-- ============================================================
create table if not exists client_sectors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table client_sectors drop constraint if exists client_sectors_name_len;
alter table client_sectors add constraint client_sectors_name_len
  check (length(trim(name)) between 1 and 80);

-- "Eurest" and "eurest" are the same sector.
create unique index if not exists client_sectors_client_name_key
  on client_sectors (client_id, lower(trim(name)));

alter table client_sectors enable row level security;

-- Read by internal staff with access to the client — the same people who can
-- see its projects. Managed by super admins, the same as clients themselves
-- (migration 006).
drop policy if exists "Internal staff can view sectors" on client_sectors;
create policy "Internal staff can view sectors"
  on client_sectors for select
  using (
    public.is_super_admin()
    or (public.is_internal_staff() and public.has_client_access(client_id))
  );

drop policy if exists "Super admins can insert sectors" on client_sectors;
create policy "Super admins can insert sectors"
  on client_sectors for insert with check (public.is_super_admin());

drop policy if exists "Super admins can update sectors" on client_sectors;
create policy "Super admins can update sectors"
  on client_sectors for update
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "Super admins can delete sectors" on client_sectors;
create policy "Super admins can delete sectors"
  on client_sectors for delete using (public.is_super_admin());

-- ============================================================
-- 2. Projects carry a sector
-- ============================================================
-- on delete set null: deleting a sector un-sectors its projects rather than
-- refusing, or deleting them.
alter table projects add column if not exists sector_id uuid references client_sectors(id) on delete set null;
create index if not exists projects_sector_id_idx on projects (sector_id) where sector_id is not null;

-- The sector has to be one of the project's client's sectors. Moving a project
-- to another client drops a sector that no longer fits instead of refusing the
-- move — the old sector can't be right for the new client.
create or replace function public.check_project_sector()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sector_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.client_id is distinct from old.client_id
     and new.sector_id is not distinct from old.sector_id then
    new.sector_id := null;
    return new;
  end if;
  if not exists (
    select 1 from client_sectors s where s.id = new.sector_id and s.client_id = new.client_id
  ) then
    raise exception 'That sector belongs to a different client.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists check_project_sector on projects;
create trigger check_project_sector
  before insert or update of sector_id, client_id on projects
  for each row execute function public.check_project_sector();

-- ============================================================
-- 3. Client requests can't pick a sector
-- ============================================================
-- Same policy as 043 with sector_id added: a sector is an internal grouping,
-- set by the team once a request is in.
drop policy if exists "Anyone can submit an intake request" on projects;
create policy "Anyone can submit an intake request"
  on projects for insert
  with check (
    source = 'intake'
    and status = 'new'
    and archived_at is null
    and install_date is null
    and install_company is null
    and install_start_time is null
    and install_end_time is null
    and value_gbp is null
    and sector_id is null
    and rams_files = '[]'::jsonb
    and jsonb_typeof(intake_answers) = 'object'
    and pg_column_size(intake_answers) <= 8000
    and jsonb_array_length(coalesce(attachments, '[]'::jsonb)) <= 10
    and length(coalesce(title, '')) between 1 and 300
    and length(coalesce(description, '')) <= 5000
    and (screen_count is null or screen_count between 0 and 500)
    and exists (
      select 1 from clients c
      where c.id = client_id and c.intake_enabled
    )
  );

-- ============================================================
-- 4. The schedule can filter by sector
-- ============================================================
-- 046's view with sector_id added at the end.
drop view if exists public.install_jobs;
create view public.install_jobs
with (security_invoker = true)
as
  select
    'project:' || p.id     as job_key,
    p.id                   as project_id,
    null::uuid             as site_id,
    p.title,
    p.reference,
    p.site_location,
    p.status,
    p.client_id,
    p.owner_id,
    p.archived_at,
    p.install_date,
    p.install_company,
    p.install_start_time,
    p.install_end_time,
    p.screen_count,
    null::text             as site_status,
    p.sector_id
  from projects p
  where not exists (select 1 from project_sites s where s.project_id = p.id)
  union all
  select
    'site:' || s.id,
    p.id,
    s.id,
    p.title,
    p.reference,
    s.site_name,
    p.status,
    p.client_id,
    p.owner_id,
    p.archived_at,
    s.install_date,
    s.install_company,
    s.install_start_time,
    s.install_end_time,
    s.screen_count,
    s.status,
    p.sector_id
  from project_sites s
  join projects p on p.id = s.project_id;

grant select on public.install_jobs to authenticated;
