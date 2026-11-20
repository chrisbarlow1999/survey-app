-- Run this once in Supabase → SQL Editor, after 045.
--
-- Install bookings per site. A three-site rollout is three installs on three
-- days, often by different firms, so the booking — date, firm, start and
-- finish — moves from the project onto each site.
--
-- HOW THE PROJECT-LEVEL FIELDS BEHAVE NOW
--   Project with no sites  — unchanged. install_date/company/times are edited
--                            on the project and are its booking.
--   Project with sites     — the bookings live on the sites. The project's own
--                            install fields become a read-only summary, kept in
--                            step by a trigger: the next open site's booking
--                            (or the latest one, once every site is done).
--                            That keeps the table, board, home page and anything
--                            else reading projects.install_date working
--                            unchanged.
--
-- The schedule reads `install_jobs` (below): one row per booked site, plus one
-- per project that has no sites. A project with sites never appears as a
-- project-level job as well, so nothing is counted twice.

alter table project_sites add column if not exists install_company text;
alter table project_sites add column if not exists install_start_time time;
alter table project_sites add column if not exists install_end_time time;

-- Same rules as the project-level fields in 041.
alter table project_sites drop constraint if exists project_sites_install_company_len;
alter table project_sites add constraint project_sites_install_company_len
  check (install_company is null or length(install_company) between 1 and 80);

alter table project_sites drop constraint if exists project_sites_install_times_ordered;
alter table project_sites add constraint project_sites_install_times_ordered check (
  install_start_time is null or install_end_time is null or install_end_time > install_start_time
);

alter table project_sites drop constraint if exists project_sites_install_times_need_date;
alter table project_sites add constraint project_sites_install_times_need_date check (
  install_date is not null or (install_start_time is null and install_end_time is null)
);

-- ============================================================
-- Carry existing project bookings onto their sites
-- ============================================================
-- Only where no site has a date of its own yet. A project with one site moves
-- its booking straight across; a rollout booked as a single date before sites
-- existed gets that date on every site, to be adjusted site by site.
update project_sites s
set install_date = p.install_date,
    install_company = p.install_company,
    install_start_time = p.install_start_time,
    install_end_time = p.install_end_time
from projects p
where p.id = s.project_id
  and p.install_date is not null
  and not exists (
    select 1 from project_sites s2
    where s2.project_id = p.id and s2.install_date is not null
  );

-- ============================================================
-- Keep the project's summary booking in step
-- ============================================================
create or replace function public.sync_project_install_from_sites(p_project uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  pick project_sites;
begin
  -- No sites: the project owns its booking; leave it alone.
  if not exists (select 1 from project_sites where project_id = p_project) then
    return;
  end if;

  -- The next booking still to happen…
  select * into pick
  from project_sites
  where project_id = p_project
    and install_date is not null
    and status not in ('installed', 'cancelled')
  order by install_date, install_start_time nulls last, position
  limit 1;

  -- …or, once they're all done, the last one that happened.
  if pick.id is null then
    select * into pick
    from project_sites
    where project_id = p_project and install_date is not null
    order by install_date desc, install_start_time desc nulls last
    limit 1;
  end if;

  -- Flag this write as the sync, so the guard below lets it through.
  perform set_config('app.site_install_sync', 'on', true);
  update projects
  set install_date = pick.install_date,
      install_company = pick.install_company,
      install_start_time = pick.install_start_time,
      install_end_time = pick.install_end_time
  where id = p_project
    and (install_date, install_company, install_start_time, install_end_time)
        is distinct from (pick.install_date, pick.install_company, pick.install_start_time, pick.install_end_time);
  perform set_config('app.site_install_sync', 'off', true);
end;
$$;

-- ============================================================
-- Guard: a project with sites is booked per site
-- ============================================================
-- Its install fields are a summary of its sites. Editing them directly would
-- put a date on the project that no site has, which the next site change then
-- silently overwrites. The app doesn't offer it (the project page shows a
-- summary, the table's bulk controls skip these projects); this is the
-- backstop for anything that tries anyway.
create or replace function public.guard_project_install_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.site_install_sync', true), 'off') <> 'on'
     and (new.install_date, new.install_company, new.install_start_time, new.install_end_time)
         is distinct from (old.install_date, old.install_company, old.install_start_time, old.install_end_time)
     and exists (select 1 from project_sites where project_id = new.id) then
    raise exception 'This project is booked site by site — set install dates on its sites instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_project_install_fields on projects;
create trigger guard_project_install_fields
  before update on projects
  for each row execute function public.guard_project_install_fields();

-- Replaces 044's touch trigger: same last_activity_at bump, plus the sync.
create or replace function public.touch_project_from_site()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
begin
  update projects set last_activity_at = now() where id = pid;
  perform public.sync_project_install_from_sites(pid);
  -- A site moved to a different project (not something the app does, but
  -- possible by hand) leaves the old one to resync too.
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    perform public.sync_project_install_from_sites(old.project_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists project_sites_touch_project on project_sites;
create trigger project_sites_touch_project
  after insert or update or delete on project_sites
  for each row execute function public.touch_project_from_site();

-- Bring every project with sites into step now.
do $$
declare r record;
begin
  for r in select distinct project_id from project_sites loop
    perform public.sync_project_install_from_sites(r.project_id);
  end loop;
end;
$$;

-- ============================================================
-- One row per install job, for the schedule
-- ============================================================
-- security_invoker so the caller's RLS on projects and project_sites applies;
-- without it a view runs as its owner and would show every client's jobs to
-- anyone who can read it.
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
    null::text             as site_status
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
    s.status
  from project_sites s
  join projects p on p.id = s.project_id;

grant select on public.install_jobs to authenticated;

-- ============================================================
-- Tracking page: per-site install times
-- ============================================================
-- get_project_for_tracking() builds each site with jsonb_build_object, so the
-- new columns need adding there. Rather than restate the whole function, a
-- small companion returns them keyed by site id.
create or replace function public.get_site_install_times(p_token uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(s.id::text, jsonb_build_object(
    'start', s.install_start_time,
    'end', s.install_end_time
  )), '{}'::jsonb)
  from project_sites s
  join projects p on p.id = s.project_id
  where p.tracking_token = p_token and p.archived_at is null;
$$;

grant execute on function public.get_site_install_times(uuid) to anon, authenticated;
