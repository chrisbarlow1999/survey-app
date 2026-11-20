-- Run this once in Supabase → SQL Editor, after 044.
--
-- Self-survey links that can be forwarded. The person with the tracking link
-- is usually head office; the person who can actually stand in the store with
-- a tape measure is the site manager. Until now the only way into a self
-- survey was via the tracking link (/track/<token>/self-survey), so forwarding
-- it handed the site manager the whole project tracker too — every site,
-- every quote, every document.
--
-- Now each site has its own self_survey_token, and /self-survey/<token> opens
-- the survey for that one site and nothing else: no tracking token, no other
-- sites, no quotes, no RAMS, no tasks. Projects with no sites get a
-- project-level token for the same purpose.
--
-- A link only works while the project is eligible for a self survey (the
-- three-week rule in project_self_survey_eligible(), 043).

alter table project_sites add column if not exists self_survey_token uuid not null default gen_random_uuid();
create unique index if not exists project_sites_self_survey_token_key on project_sites (self_survey_token);

alter table projects add column if not exists self_survey_token uuid not null default gen_random_uuid();
create unique index if not exists projects_self_survey_token_key on projects (self_survey_token);

-- ============================================================
-- Links for the tracking page
-- ============================================================
-- Kept separate from get_project_for_tracking() so the tracker's payload
-- doesn't change shape. Same gate: the tracking token.
create or replace function public.get_self_survey_links(p_token uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'project', p.self_survey_token,
    'sites', coalesce((
      select jsonb_object_agg(ps.id::text, ps.self_survey_token)
      from project_sites ps where ps.project_id = p.id
    ), '{}'::jsonb)
  )
  from projects p
  where p.tracking_token = p_token and p.archived_at is null
  limit 1;
$$;

grant execute on function public.get_self_survey_links(uuid) to anon, authenticated;

-- ============================================================
-- What a self-survey link may see
-- ============================================================
-- Just enough to pre-fill the form and say whose survey it is. Never the
-- tracking token, never another site.
create or replace function public.get_self_survey_context(p_link uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  p projects;
  s project_sites;
begin
  select * into s from project_sites where self_survey_token = p_link limit 1;
  if s.id is not null then
    select * into p from projects where id = s.project_id;
  else
    select * into p from projects where self_survey_token = p_link limit 1;
    -- A project-level link is only for projects with no sites; once sites
    -- exist, each one's own link is the way in.
    if p.id is not null and exists (select 1 from project_sites where project_id = p.id) then
      return null;
    end if;
  end if;

  if p.id is null or p.archived_at is not null then
    return null;
  end if;

  return jsonb_build_object(
    'title', p.title,
    'client_name', (select c.name from clients c where c.id = p.client_id),
    'eligible', public.project_self_survey_eligible(p)
                and coalesce(s.status, '') not in ('installed', 'cancelled'),
    'site_name', coalesce(s.site_name, p.site_location),
    'address', coalesce(s.address, p.address),
    'manager_name', s.manager_name,
    'manager_phone', s.manager_phone,
    'requested_by', case when s.id is null then p.requested_by else null end
  );
end;
$$;

grant execute on function public.get_self_survey_context(uuid) to anon, authenticated;

-- ============================================================
-- Submitting through a self-survey link
-- ============================================================
-- Resolves the link to its project (and site), then hands over to the same
-- submit_self_survey() the tracking page used, so every check — eligibility,
-- photo paths, sizes, rate limit — lives in one place.
create or replace function public.submit_self_survey_via_link(p_link uuid, p_survey jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s project_sites;
  p projects;
begin
  select * into s from project_sites where self_survey_token = p_link limit 1;
  if s.id is not null then
    select * into p from projects where id = s.project_id;
    if s.status in ('installed', 'cancelled') then
      raise exception 'Self survey is not available for this site';
    end if;
  else
    select * into p from projects where self_survey_token = p_link limit 1;
    if p.id is not null and exists (select 1 from project_sites where project_id = p.id) then
      raise exception 'Self survey is not available for this link';
    end if;
  end if;

  if p.id is null then
    raise exception 'Self survey is not available for this link';
  end if;

  return public.submit_self_survey(p.tracking_token, p_survey, s.id);
end;
$$;

grant execute on function public.submit_self_survey_via_link(uuid, jsonb) to anon, authenticated;
