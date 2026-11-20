-- Run this once in Supabase → SQL Editor, after 043.
--
-- Multi-site projects. A rollout like Saputo's is one project for one client,
-- but three locations — three addresses, three cost centres, three site
-- managers, three install dates. Each location is a row in `project_sites`.
--
-- WHAT LIVES WHERE
--   project       — the job: title, client, owner, overall status, needed-by
--                   date, tasks, notes, attachments, tracking link.
--   project_site  — one location: address, cost centre, unit number, site
--                   manager, screens, opening hours and install preferences,
--                   site access answers, RAMS, its own stage and install date.
--   survey        — may now point at a site as well as a project
--                   (surveys.project_site_id), so "which location was this?" is
--                   recorded rather than guessed from the site name.
--
-- Every request from the client form now creates at least one site, including
-- single-site requests, so there is one shape to read. Projects created before
-- this — and manual projects — may have no sites; they keep using the
-- project-level site name, address, access answers and RAMS from 043, and a PM
-- can add sites to them at any time.
--
-- projects.site_location is still filled in on a request (the site name, or the
-- site names joined for a rollout) so the board, table, search and Site History
-- carry on working without knowing about sites.

-- ============================================================
-- 1. Sites
-- ============================================================
create table if not exists project_sites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  position integer not null default 0,
  site_name text not null,
  address text,
  cost_centre text,
  unit_number text,
  manager_name text,
  manager_phone text,
  manager_email text,
  screen_count integer,
  opening_hours text,
  install_preferences text,
  notes text,
  -- Same questions and shape as projects.intake_answers (lib/intakeQuestions.js).
  access_answers jsonb not null default '{}'::jsonb,
  rams_required boolean,
  rams_files jsonb not null default '[]'::jsonb,
  -- Keys live in lib/siteStatus.js, like project statuses, so no check
  -- constraint — only internal staff can write here.
  status text not null default 'pending',
  install_date date,
  created_at timestamptz not null default now()
);

alter table project_sites drop constraint if exists project_sites_screen_count_range;
alter table project_sites add constraint project_sites_screen_count_range
  check (screen_count is null or screen_count between 0 and 10000);

create index if not exists project_sites_project_id_idx on project_sites (project_id, position);
create index if not exists project_sites_install_date_idx on project_sites (install_date) where install_date is not null;

alter table project_sites enable row level security;

-- Internal staff only, inheriting from the parent project exactly as tasks do.
-- No anonymous insert policy: requests create sites through
-- submit_intake_request() below, never directly.
drop policy if exists "Project access governs site select" on project_sites;
create policy "Project access governs site select"
  on project_sites for select using (public.can_access_project(project_id));

drop policy if exists "Project access governs site insert" on project_sites;
create policy "Project access governs site insert"
  on project_sites for insert with check (public.can_access_project(project_id));

drop policy if exists "Project access governs site update" on project_sites;
create policy "Project access governs site update"
  on project_sites for update
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

drop policy if exists "Project access governs site delete" on project_sites;
create policy "Project access governs site delete"
  on project_sites for delete using (public.can_access_project(project_id));

-- A site moving counts as the project moving, for the "gone quiet" panel.
create or replace function public.touch_project_from_site()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update projects set last_activity_at = now()
  where id = coalesce(new.project_id, old.project_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists project_sites_touch_project on project_sites;
create trigger project_sites_touch_project
  after insert or update or delete on project_sites
  for each row execute function public.touch_project_from_site();

-- ============================================================
-- 2. Surveys can belong to a site
-- ============================================================
alter table surveys add column if not exists project_site_id uuid references project_sites(id) on delete set null;
create index if not exists surveys_project_site_id_idx on surveys (project_site_id);

-- ============================================================
-- 3. Submitting a request
-- ============================================================
-- One call that creates the project and all of its sites together, so a
-- three-site request can never land as a project with one site and an error.
--
-- Security definer, so RLS doesn't apply to the inserts — every rule the
-- anonymous insert policy enforces (043) is enforced here instead. The
-- triggers on projects still fire: the per-client rate limit (026), the
-- submission snapshot (043) and the auto-applied template (023).
--
-- Returns the tracking token for the thank-you page.
create or replace function public.submit_intake_request(p_slug text, p_request jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c clients;
  sites jsonb := p_request -> 'sites';
  site jsonb;
  new_project uuid := gen_random_uuid();
  token uuid := gen_random_uuid();
  idx integer := 0;
  site_count integer;
  total_screens integer;
  names text;
  first_address text;
  attachments jsonb := coalesce(p_request -> 'attachments', '[]'::jsonb);
begin
  select * into c from clients where slug = p_slug and intake_enabled limit 1;
  if c.id is null then
    raise exception 'This request form is not available';
  end if;

  if length(coalesce(trim(p_request ->> 'title'), '')) not between 1 and 300 then
    raise exception 'A request title is required (up to 300 characters)';
  end if;
  if coalesce(trim(p_request ->> 'requested_by'), '') = '' then
    raise exception 'A contact name is required';
  end if;
  if length(coalesce(p_request ->> 'description', '')) > 5000 then
    raise exception 'Details are too long';
  end if;
  if jsonb_typeof(sites) <> 'array' or jsonb_array_length(sites) not between 1 and 50 then
    raise exception 'A request needs between 1 and 50 sites';
  end if;
  if jsonb_typeof(attachments) <> 'array' or jsonb_array_length(attachments) > 10 then
    raise exception 'Too many attachments';
  end if;
  -- Only files the request form itself uploaded.
  if exists (
    select 1 from jsonb_array_elements(attachments) a
    where coalesce(a ->> 'path', '') not like 'attachments/%'
  ) then
    raise exception 'Invalid attachment';
  end if;
  if pg_column_size(p_request) > 400000 then
    raise exception 'Request is too large';
  end if;

  site_count := jsonb_array_length(sites);
  for site in select * from jsonb_array_elements(sites) loop
    if coalesce(trim(site ->> 'site_name'), '') = '' then
      raise exception 'Every site needs a name';
    end if;
    if site -> 'access_answers' is not null and jsonb_typeof(site -> 'access_answers') <> 'object' then
      raise exception 'Invalid site access answers';
    end if;
  end loop;

  select
    sum(case when (s ->> 'screen_count') ~ '^\d{1,5}$' then (s ->> 'screen_count')::integer end),
    string_agg(trim(s ->> 'site_name'), ', ' order by ord)
  into total_screens, names
  from jsonb_array_elements(sites) with ordinality as t(s, ord);

  first_address := nullif(left(trim(sites -> 0 ->> 'address'), 500), '');

  insert into projects (
    id, client_id, title, description, requested_by, requester_email,
    due_date, screen_count, attachments, source, status, tracking_token,
    site_location, address
  ) values (
    new_project, c.id,
    left(trim(p_request ->> 'title'), 300),
    nullif(left(p_request ->> 'description', 5000), ''),
    left(trim(p_request ->> 'requested_by'), 200),
    nullif(left(trim(p_request ->> 'requester_email'), 200), ''),
    nullif(p_request ->> 'due_date', '')::date,
    case when total_screens between 0 and 10000 then total_screens else null end,
    attachments,
    'intake', 'new', token,
    left(names, 300),
    case when site_count = 1 then first_address else null end
  );

  for site in select * from jsonb_array_elements(sites) loop
    insert into project_sites (
      project_id, position, site_name, address, cost_centre, unit_number,
      manager_name, manager_phone, manager_email, screen_count,
      opening_hours, install_preferences, notes, access_answers, rams_required
    ) values (
      new_project, idx,
      left(trim(site ->> 'site_name'), 200),
      nullif(left(trim(site ->> 'address'), 500), ''),
      nullif(left(trim(site ->> 'cost_centre'), 100), ''),
      nullif(left(trim(site ->> 'unit_number'), 100), ''),
      nullif(left(trim(site ->> 'manager_name'), 200), ''),
      nullif(left(trim(site ->> 'manager_phone'), 50), ''),
      nullif(left(trim(site ->> 'manager_email'), 200), ''),
      case when (site ->> 'screen_count') ~ '^\d{1,5}$' then (site ->> 'screen_count')::integer else null end,
      nullif(left(trim(site ->> 'opening_hours'), 500), ''),
      nullif(left(trim(site ->> 'install_preferences'), 1000), ''),
      nullif(left(trim(site ->> 'notes'), 2000), ''),
      case when pg_column_size(coalesce(site -> 'access_answers', '{}'::jsonb)) <= 8000
           then coalesce(site -> 'access_answers', '{}'::jsonb) else '{}'::jsonb end,
      case site ->> 'rams_required' when 'true' then true when 'false' then false else null end
    );
    idx := idx + 1;
  end loop;

  -- The snapshot trigger ran before the sites existed; add them as submitted.
  update projects
  set intake_submission = coalesce(intake_submission, '{}'::jsonb) || jsonb_build_object(
    'sites', (
      select jsonb_agg(jsonb_build_object(
        'site_name', ps.site_name, 'address', ps.address,
        'cost_centre', ps.cost_centre, 'unit_number', ps.unit_number,
        'manager_name', ps.manager_name, 'manager_phone', ps.manager_phone,
        'manager_email', ps.manager_email, 'screen_count', ps.screen_count,
        'opening_hours', ps.opening_hours, 'install_preferences', ps.install_preferences,
        'notes', ps.notes, 'access_answers', ps.access_answers,
        'rams_required', ps.rams_required
      ) order by ps.position)
      from project_sites ps where ps.project_id = new_project
    )
  )
  where id = new_project;

  return token;
end;
$$;

grant execute on function public.submit_intake_request(text, jsonb) to anon, authenticated;

-- ============================================================
-- 4. Tracking page reads sites too
-- ============================================================
-- 043's function plus a `sites` array. Site ids go out because the self-survey
-- link names the site it's for; submit_self_survey() checks the site belongs
-- to the token's project, so an id alone opens nothing.
create or replace function public.get_project_for_tracking(p_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  p projects;
  result jsonb;
begin
  select * into p
  from projects
  where tracking_token = p_token
    and archived_at is null
  limit 1;

  if p.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'title', p.title,
    'reference', p.reference,
    'client_name', (select c.name from clients c where c.id = p.client_id),
    'site_location', p.site_location,
    'address', p.address,
    'status', p.status,
    'due_date', p.due_date,
    'install_date', p.install_date,
    'install_start_time', p.install_start_time,
    'install_end_time', p.install_end_time,
    'screen_count', p.screen_count,
    'source', p.source,
    'created_at', p.created_at,
    'intake_answers', p.intake_answers,
    'submission', p.intake_submission,
    'rams_required', p.rams_required,
    'rams_files', p.rams_files,
    'self_survey_eligible', public.project_self_survey_eligible(p),
    'sites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ps.id,
        'site_name', ps.site_name,
        'address', ps.address,
        'cost_centre', ps.cost_centre,
        'unit_number', ps.unit_number,
        'manager_name', ps.manager_name,
        'manager_phone', ps.manager_phone,
        'manager_email', ps.manager_email,
        'screen_count', ps.screen_count,
        'opening_hours', ps.opening_hours,
        'install_preferences', ps.install_preferences,
        'notes', ps.notes,
        'access_answers', ps.access_answers,
        'rams_required', ps.rams_required,
        'rams_files', ps.rams_files,
        'status', ps.status,
        'install_date', ps.install_date,
        'self_surveyed_at', (
          select max(s.submitted_at) from surveys s
          where s.project_site_id = ps.id and s.survey_kind = 'self' and s.archived_at is null
        )
      ) order by ps.position, ps.created_at)
      from project_sites ps
      where ps.project_id = p.id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', t.title,
        'due_date', t.due_date,
        'completed_at', t.completed_at
      ) order by (t.completed_at is not null), t.position, t.created_at)
      from project_tasks t
      where t.project_id = p.id and t.client_visible
    ), '[]'::jsonb),
    'survey_approvals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'site_location', s.site_location,
        'survey_date', s.survey_date,
        'approval_status', s.approval_status,
        'approval_token', s.approval_token
      ) order by s.survey_date desc nulls last)
      from surveys s
      where s.project_id = p.id
        and s.archived_at is null
        and s.approval_status <> 'not_sent'
    ), '[]'::jsonb),
    'quote_approvals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', cs.title,
        'reference', cs.reference,
        'approval_status', cs.approval_status,
        'approval_token', cs.approval_token
      ) order by cs.created_at desc)
      from cost_sheets cs
      join surveys s on s.id = cs.survey_id
      where s.project_id = p.id
        and cs.archived_at is null
        and cs.approval_status <> 'not_sent'
    ), '[]'::jsonb),
    'self_surveys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'site_location', s.site_location,
        'submitted_at', s.submitted_at
      ) order by s.submitted_at desc)
      from surveys s
      where s.project_id = p.id
        and s.survey_kind = 'self'
        and s.archived_at is null
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- ============================================================
-- 5. Self surveys name their site
-- ============================================================
-- Replaces 043's two-argument version. Dropped rather than overloaded so a
-- call with two arguments can't be ambiguous between them.
drop function if exists public.submit_self_survey(uuid, jsonb);

create or replace function public.submit_self_survey(p_token uuid, p_survey jsonb, p_site_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p projects;
  s project_sites;
  recent integer;
  new_id uuid := gen_random_uuid();
  full_name text := trim(coalesce(p_survey ->> 'name', ''));
  first_name text;
  last_name text;
begin
  first_name := left(split_part(full_name, ' ', 1), 100);
  last_name := left(trim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), 100);

  select * into p from projects where tracking_token = p_token limit 1;
  if p.id is null or not public.project_self_survey_eligible(p) then
    raise exception 'Self survey is not available for this project';
  end if;

  if p_site_id is not null then
    select * into s from project_sites where id = p_site_id and project_id = p.id;
    if s.id is null then
      raise exception 'Unknown site';
    end if;
  end if;

  if jsonb_typeof(p_survey -> 'locations') <> 'array'
     or jsonb_array_length(p_survey -> 'locations') not between 1 and 30
     or pg_column_size(p_survey) > 200000 then
    raise exception 'Invalid survey';
  end if;

  if exists (
       select 1 from jsonb_array_elements(p_survey -> 'locations') a
       where a ->> 'photo_path' is not null and a ->> 'photo_path' not like 'self-survey/%'
     )
     or exists (
       select 1
       from jsonb_array_elements(p_survey -> 'locations') a,
            jsonb_array_elements_text(coalesce(a -> 'additional_photos', '[]'::jsonb)) ph
       where ph not like 'self-survey/%'
     ) then
    raise exception 'Invalid photo reference';
  end if;

  if full_name = '' or coalesce(trim(p_survey ->> 'phone'), '') = '' then
    raise exception 'A name and phone number are required';
  end if;

  select count(*) into recent
  from surveys
  where project_id = p.id and survey_kind = 'self' and submitted_at > now() - interval '1 hour';
  if recent >= 5 then
    raise exception 'Too many self surveys for this project in the last hour. Please try again later.'
      using errcode = 'check_violation';
  end if;

  insert into surveys (
    id, survey_kind, project_id, project_site_id, client_id,
    engineer_first, engineer_last, engineer_company, phone,
    survey_date, site_location, address, site_contact,
    locations, additional_info
  ) values (
    new_id, 'self', p.id, s.id, p.client_id,
    first_name,
    coalesce(nullif(last_name, ''), '(self survey)'),
    'Client self survey',
    left(trim(p_survey ->> 'phone'), 40),
    current_date,
    coalesce(nullif(left(trim(p_survey ->> 'site_location'), 200), ''), s.site_name, p.site_location, p.title),
    coalesce(nullif(left(trim(p_survey ->> 'address'), 500), ''), s.address, p.address),
    left(coalesce(p_survey ->> 'site_contact', ''), 300),
    p_survey -> 'locations',
    left(coalesce(p_survey ->> 'additional_info', ''), 5000)
  );

  insert into project_activity (project_id, actor_name, action, detail)
  values (p.id, left(full_name, 100), 'Self survey submitted',
          coalesce(s.site_name || ' · ', '') || jsonb_array_length(p_survey -> 'locations') || ' area(s)');

  return new_id;
end;
$$;

grant execute on function public.submit_self_survey(uuid, jsonb, uuid) to anon, authenticated;
