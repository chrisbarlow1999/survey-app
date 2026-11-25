-- Run this once in Supabase → SQL Editor, after 049.
--
-- Engineer companies: the firms offered on the survey, install and visit forms,
-- and as the install team on projects and sites. Managed under Setup →
-- Engineer Companies instead of being written into lib/engineerCompanies.js
-- (which stays as the fallback until this has run).
--
-- RECORDS STORE THE NAME
-- surveys/installations/visits.engineer_company and projects/project_sites.
-- install_company hold the firm's name as text (migration 035), not a link to
-- this table. So:
--   • retiring a firm only takes it off the dropdowns — old records keep it;
--   • renaming goes through rename_engineer_company() below, which renames it on
--     every record and booking at the same time, so the Engineer Companies
--     report and the install calendar don't split one firm into two.
-- There's deliberately no delete.
--
-- "Other" (type a name) stays built into the forms rather than being a row.

create table if not exists engineer_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists engineer_companies_name_key on engineer_companies (lower(trim(name)));

alter table engineer_companies enable row level security;

-- Read by everyone: the engineer forms are public pages.
drop policy if exists "Anyone can read engineer companies" on engineer_companies;
create policy "Anyone can read engineer companies"
  on engineer_companies for select
  using (true);

drop policy if exists "Super admins can add engineer companies" on engineer_companies;
create policy "Super admins can add engineer companies"
  on engineer_companies for insert
  with check (public.is_super_admin());

-- Updates are for active/position only — a name change outside the rename
-- function would leave records under the old name, so the trigger below
-- refuses it.
drop policy if exists "Super admins can edit engineer companies" on engineer_companies;
create policy "Super admins can edit engineer companies"
  on engineer_companies for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select on engineer_companies to anon, authenticated;
grant insert, update on engineer_companies to authenticated;

create or replace function public.engineer_companies_lock_name()
returns trigger
language plpgsql
as $$
begin
  if new.name is distinct from old.name
     and coalesce(current_setting('app.engineer_company_rename', true), 'off') <> 'on' then
    raise exception 'Rename a firm with rename_engineer_company(), so its records are renamed too.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists engineer_companies_lock_name on engineer_companies;
create trigger engineer_companies_lock_name
  before update on engineer_companies
  for each row execute function public.engineer_companies_lock_name();

-- ============================================================
-- Rename a firm everywhere
-- ============================================================
-- Returns how many records were renamed, for the admin page to report.
create or replace function public.rename_engineer_company(p_id uuid, p_name text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  old_name text;
  new_name text := trim(coalesce(p_name, ''));
  n_surveys integer;
  n_installs integer;
  n_visits integer;
  n_sites integer;
  n_projects integer;
begin
  if not public.is_super_admin() then
    raise exception 'Only super admins can rename engineer companies.' using errcode = 'insufficient_privilege';
  end if;
  if length(new_name) not between 1 and 80 then
    raise exception 'A firm''s name must be 1–80 characters.' using errcode = 'check_violation';
  end if;

  old_name := (select name from engineer_companies where id = p_id);
  if old_name is null then
    raise exception 'That firm no longer exists.' using errcode = 'no_data_found';
  end if;
  if old_name = new_name then
    return jsonb_build_object('surveys', 0, 'installations', 0, 'visits', 0, 'sites', 0, 'projects', 0);
  end if;

  perform set_config('app.engineer_company_rename', 'on', true);
  update engineer_companies set name = new_name where id = p_id;

  update surveys       set engineer_company = new_name where engineer_company = old_name;
  get diagnostics n_surveys = row_count;
  update installations set engineer_company = new_name where engineer_company = old_name;
  get diagnostics n_installs = row_count;
  update visits        set engineer_company = new_name where engineer_company = old_name;
  get diagnostics n_visits = row_count;

  -- Sites first: their sync trigger copies the booking up to the project.
  update project_sites set install_company = new_name where install_company = old_name;
  get diagnostics n_sites = row_count;
  -- Then projects without sites (and any left over). 046's guard blocks direct
  -- install-field writes on projects with sites unless the sync flag is set.
  perform set_config('app.site_install_sync', 'on', true);
  update projects set install_company = new_name where install_company = old_name;
  get diagnostics n_projects = row_count;
  perform set_config('app.site_install_sync', 'off', true);
  perform set_config('app.engineer_company_rename', 'off', true);

  return jsonb_build_object('surveys', n_surveys, 'installations', n_installs, 'visits', n_visits,
                            'sites', n_sites, 'projects', n_projects);
end;
$$;

revoke all on function public.rename_engineer_company(uuid, text) from public, anon;
grant execute on function public.rename_engineer_company(uuid, text) to authenticated;

-- ============================================================
-- Seed: the four firms the forms already offer, plus the install teams the
-- Live Project Tracker uses.
-- ============================================================
insert into engineer_companies (name, position) values
  ('SCCI', 10), ('EIT', 20), ('Internal', 30), ('Index', 40),
  ('B&B', 50), ('ThinkPM', 60), ('Airwave', 70)
on conflict do nothing;
