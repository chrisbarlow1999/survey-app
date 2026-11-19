-- Run this once in Supabase → SQL Editor, after 042.
--
-- The client side of a project. Four things, all hanging off one idea: a
-- request now gets a private link the client keeps, and that link is their
-- window onto the job.
--
--   1. intake_answers  — the branching questions on the request form (is the
--                        site restricted access, and if so what that involves).
--   2. RAMS            — whether the job needs RAMS, and the documents Linney
--                        uploads for it. The client can download them.
--   3. tracking_token  — the private link (/track/<token>), plus the snapshot
--                        of what the client actually submitted, and a per-task
--                        "show to client" flag.
--   4. self surveys    — when the requested date is within three weeks, the
--                        client can survey the site themselves from their link.
--
-- WHAT A TRACKING LINK NEVER SHOWS
-- Notes, the activity trail, the owner, priority, value, the booked firm, and
-- any task not ticked "show to client". get_project_for_tracking() is the whole
-- public surface and never selects them — the same approach as the survey
-- approval page (migration 034).
--
-- WHY A SNAPSHOT OF THE SUBMISSION
-- A project's description and attachments are edited by PMs after it arrives,
-- and the auto-applied template (migration 023) adds its own files to
-- `attachments`. Showing the live columns would hand internal files and
-- commentary to anyone with the link. So the request is copied, as submitted,
-- into `intake_submission` by a trigger, and the client sees that.

-- ============================================================
-- 1. Branching intake answers
-- ============================================================
alter table projects add column if not exists intake_answers jsonb not null default '{}'::jsonb;

-- ============================================================
-- 2. RAMS
-- ============================================================
-- Null = not asked / not known. True = required: the project page flags it until
-- something is uploaded. False = not required: the section stays, optional.
alter table projects add column if not exists rams_required boolean;
alter table projects add column if not exists rams_files jsonb not null default '[]'::jsonb;

-- ============================================================
-- 3. Tracking link
-- ============================================================
-- Default fills every existing project, so a PM can send a link for work raised
-- before this migration too. The request form generates its own token in the
-- browser (anonymous submitters can't read the row back to learn it).
alter table projects add column if not exists tracking_token uuid not null default gen_random_uuid();
create unique index if not exists projects_tracking_token_key on projects (tracking_token);

alter table projects add column if not exists intake_submission jsonb;

-- Captured BEFORE insert, so it's the request as typed, before the template
-- trigger (an AFTER trigger) adds its description and files.
create or replace function public.capture_intake_submission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.intake_submission := jsonb_build_object(
    'title', new.title,
    'site_location', new.site_location,
    'address', new.address,
    'description', new.description,
    'due_date', new.due_date,
    'screen_count', new.screen_count,
    'requested_by', new.requested_by,
    'requester_email', new.requester_email,
    'attachments', coalesce(new.attachments, '[]'::jsonb),
    'submitted_at', now()
  );
  return new;
end;
$$;

drop trigger if exists capture_intake_submission on projects;
create trigger capture_intake_submission
  before insert on projects
  for each row
  when (new.source = 'intake')
  execute function public.capture_intake_submission();

-- Requests that arrived before this migration. Their live columns may already
-- carry PM edits and template files, so the backfill takes the plain text
-- fields only and leaves attachments out rather than risk exposing an internal
-- file.
update projects
set intake_submission = jsonb_build_object(
  'title', title,
  'site_location', site_location,
  'address', address,
  'description', null,
  'due_date', due_date,
  'screen_count', screen_count,
  'requested_by', requested_by,
  'requester_email', requester_email,
  'attachments', '[]'::jsonb,
  'submitted_at', created_at,
  'backfilled', true
)
where source = 'intake' and intake_submission is null;

-- Tasks are internal unless ticked. Default false, so nothing that exists today
-- becomes visible to a client by running this.
alter table project_tasks add column if not exists client_visible boolean not null default false;
alter table project_template_tasks add column if not exists client_visible boolean not null default false;

-- ============================================================
-- Re-state the intake insert policy
-- ============================================================
-- Same rules as 041, plus: a client can't upload its own RAMS or pre-fill the
-- snapshot, the answers blob is size-capped, and rams_required is all a
-- requester may say about RAMS.
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
-- Template tasks carry the "show to client" tick onto requests
-- ============================================================
-- Same function as 023 with one column added to the task copy.
create or replace function public.apply_default_project_template()
returns trigger
language plpgsql security definer
as $$
declare
  tpl record;
begin
  select * into tpl
  from project_templates
  where is_default and client_id = new.client_id
  limit 1;

  if tpl is null then
    select * into tpl
    from project_templates
    where is_default and client_id is null
    limit 1;
  end if;

  if tpl is null then
    return new;
  end if;

  insert into project_tasks (project_id, title, position, due_date, client_visible)
  select
    new.id,
    t.title,
    t.position,
    case when t.due_offset_days is null then null
         else (current_date + t.due_offset_days) end,
    coalesce(t.client_visible, false)
  from project_template_tasks t
  where t.template_id = tpl.id;

  update projects
  set
    description = coalesce(nullif(new.description, ''), tpl.description),
    priority    = coalesce(tpl.priority, priority),
    owner_id    = coalesce(new.owner_id, tpl.default_owner_id),
    attachments = case
                    when jsonb_array_length(new.attachments) > 0
                      then new.attachments || coalesce(tpl.attachments, '[]'::jsonb)
                    else coalesce(tpl.attachments, '[]'::jsonb)
                  end
  where id = new.id;

  insert into project_activity (project_id, actor_name, action, detail)
  values (new.id, 'System', 'Template applied', tpl.name);

  return new;
end;
$$;

-- ============================================================
-- 4. Self surveys
-- ============================================================
-- A self survey is a row in `surveys` like any other, so quotes, the screens
-- pipeline and the approval flow all work on it — marked so nobody mistakes a
-- client's tape-measure for an engineer's visit.
alter table surveys add column if not exists survey_kind text not null default 'engineer';
alter table surveys drop constraint if exists surveys_survey_kind_check;
alter table surveys add constraint surveys_survey_kind_check
  check (survey_kind in ('engineer', 'self'));

-- One rule, used by both the tracking page and the submit function so they
-- can't disagree: an open project whose requested date is within three weeks
-- of when it was raised.
create or replace function public.project_self_survey_eligible(p projects)
returns boolean
language sql
stable
as $$
  select p.archived_at is null
     and p.status not in ('complete', 'cancelled')
     and p.due_date is not null
     and p.due_date <= (p.created_at at time zone 'Europe/London')::date + 21;
$$;

-- ============================================================
-- Reading a project by its tracking token
-- ============================================================
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
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', t.title,
        'due_date', t.due_date,
        'completed_at', t.completed_at
      ) order by (t.completed_at is not null), t.position, t.created_at)
      from project_tasks t
      where t.project_id = p.id and t.client_visible
    ), '[]'::jsonb),
    -- Surveys and quotes waiting on the client. Only their own approval tokens
    -- go out — the same tokens a PM would otherwise email them.
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

grant execute on function public.get_project_for_tracking(uuid) to anon, authenticated;

-- ============================================================
-- Submitting a self survey
-- ============================================================
-- Security definer because the survey has to land already linked to the
-- project, and an anonymous submitter can't read projects to find its id.
-- Everything identifying comes from the project, not from the payload: the
-- client, the project link and the kind are set here, so a token can only ever
-- add a self survey to its own project.
create or replace function public.submit_self_survey(p_token uuid, p_survey jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p projects;
  recent integer;
  new_id uuid := gen_random_uuid();
  full_name text := trim(coalesce(p_survey ->> 'name', ''));
  first_name text;
  last_name text;
begin
  -- engineer_first/last are not null on surveys; a client gives one name box.
  first_name := left(split_part(full_name, ' ', 1), 100);
  last_name := left(trim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), 100);

  select * into p from projects where tracking_token = p_token limit 1;
  if p.id is null or not public.project_self_survey_eligible(p) then
    raise exception 'Self survey is not available for this project';
  end if;

  if jsonb_typeof(p_survey -> 'locations') <> 'array'
     or jsonb_array_length(p_survey -> 'locations') not between 1 and 30
     or pg_column_size(p_survey) > 200000 then
    raise exception 'Invalid survey';
  end if;

  -- Photos must be ones uploaded by the self-survey form. Without this a
  -- payload could name any path in the bucket, and once the survey was sent
  -- for approval /api/approval-photo would happily sign it.
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

  -- A handful per hour is plenty for a real client correcting a mistake.
  select count(*) into recent
  from surveys
  where project_id = p.id and survey_kind = 'self' and submitted_at > now() - interval '1 hour';
  if recent >= 5 then
    raise exception 'Too many self surveys for this project in the last hour. Please try again later.'
      using errcode = 'check_violation';
  end if;

  insert into surveys (
    id, survey_kind, project_id, client_id,
    engineer_first, engineer_last, engineer_company, phone,
    survey_date, site_location, address, site_contact,
    locations, additional_info
  ) values (
    new_id, 'self', p.id, p.client_id,
    first_name,
    coalesce(nullif(last_name, ''), '(self survey)'),
    'Client self survey',
    left(trim(p_survey ->> 'phone'), 40),
    current_date,
    coalesce(nullif(left(trim(p_survey ->> 'site_location'), 200), ''), p.site_location, p.title),
    coalesce(nullif(left(trim(p_survey ->> 'address'), 500), ''), p.address),
    left(coalesce(p_survey ->> 'site_contact', ''), 300),
    p_survey -> 'locations',
    left(coalesce(p_survey ->> 'additional_info', ''), 5000)
  );

  insert into project_activity (project_id, actor_name, action, detail)
  values (p.id, left(full_name, 100), 'Self survey submitted',
          jsonb_array_length(p_survey -> 'locations') || ' area(s)');

  return new_id;
end;
$$;

grant execute on function public.submit_self_survey(uuid, jsonb) to anon, authenticated;
