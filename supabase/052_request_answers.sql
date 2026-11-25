-- Run this once in Supabase → SQL Editor, after 051 — and BEFORE deploying the
-- request-form change (until it runs, the new answers are sent but ignored;
-- nothing breaks, they just aren't saved).
--
-- The client request form gains questions about the request as a whole:
-- budget, a different delivery address (with a delivery contact and phone),
-- and whether new content is needed (what, and by when). See REQUEST_QUESTIONS
-- in lib/intakeQuestions.js.
--
-- They're stored in projects.intake_answers (added in 043, unused at project
-- level since 044 moved the site-access answers onto each site). No new
-- columns. The project page and the client's tracking page already show it.
--
-- This replaces submit_intake_request() from 044 with an identical copy that
-- also saves p_request -> 'answers'. Everything else is unchanged.

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
  answers jsonb := coalesce(p_request -> 'answers', '{}'::jsonb);
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
  -- Same limits the anonymous insert policy puts on intake_answers (043).
  if jsonb_typeof(answers) <> 'object' or pg_column_size(answers) > 8000 then
    raise exception 'Invalid request answers';
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
    site_location, address, intake_answers
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
    case when site_count = 1 then first_address else null end,
    answers
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
