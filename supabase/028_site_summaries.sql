-- Run this once in Supabase → SQL Editor, after 027.
--
-- /sites used to load every row of surveys, installations and visits and group
-- them in JavaScript. That was fine at a handful of records and was always
-- going to be the first thing to slow down. This does the grouping and paging
-- in Postgres instead, so the page fetches one screenful however much history
-- builds up.
--
-- The grouping key must match lib/siteName.js exactly — trim, lowercase AND
-- collapse runs of whitespace. Getting that last part wrong would split
-- "Barlow  Manor" into its own group here while the detail page merged it,
-- so the row would link to a page showing different records.
--
-- There is still no real relationship between a survey and its later install —
-- that remains deliberate.

-- Return type changes, so the old signature has to go first — Postgres won't
-- let CREATE OR REPLACE alter it.
drop function if exists public.site_summaries(text, integer, integer);

create or replace function public.site_summaries(
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  site_key text,
  display_name text,
  client_names text[],
  last_activity timestamptz,
  survey_count bigint,
  install_count bigint,
  visit_count bigint,
  total_count bigint
)
language sql
security invoker
stable
as $$
  with unioned as (
    select lower(regexp_replace(trim(site_location), '[[:space:]]+', ' ', 'g')) as site_key, site_location, client_id, submitted_at, 'survey' as kind
      from surveys where archived_at is null and coalesce(trim(site_location), '') <> ''
    union all
    select lower(regexp_replace(trim(site_location), '[[:space:]]+', ' ', 'g')), site_location, client_id, submitted_at, 'install'
      from installations where archived_at is null and coalesce(trim(site_location), '') <> ''
    union all
    select lower(regexp_replace(trim(site_location), '[[:space:]]+', ' ', 'g')), site_location, client_id, submitted_at, 'visit'
      from visits where archived_at is null and coalesce(trim(site_location), '') <> ''
  ),
  grouped as (
    select
      u.site_key,
      -- The most recently used spelling wins as the label, so a tidied-up name
      -- takes over from the original without splitting the group.
      (array_agg(u.site_location order by u.submitted_at desc))[1] as display_name,
      -- A site can carry records for more than one client — the old in-memory
      -- version showed every one, so keep all of them rather than just the
      -- most recent.
      array_remove(array_agg(distinct c.name), null) as client_names,
      max(u.submitted_at) as last_activity,
      count(*) filter (where u.kind = 'survey') as survey_count,
      count(*) filter (where u.kind = 'install') as install_count,
      count(*) filter (where u.kind = 'visit') as visit_count,
      count(*) as total_count
    from unioned u
    left join clients c on c.id = u.client_id
    group by u.site_key
  )
  select * from grouped
  where p_search is null
     or trim(p_search) = ''
     or display_name ilike '%' || trim(p_search) || '%'
     or exists (select 1 from unnest(client_names) n where n ilike '%' || trim(p_search) || '%')
  order by last_activity desc nulls last
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- security invoker, NOT definer: this must run as the caller so RLS still
-- filters each underlying table by client access. A definer function here
-- would quietly show every client's sites to everyone.

-- Total number of groups, for the pager. Same filter as above.
create or replace function public.site_summaries_count(p_search text default null)
returns bigint
language sql
security invoker
stable
as $$
  with unioned as (
    select lower(regexp_replace(trim(site_location), '[[:space:]]+', ' ', 'g')) as site_key, site_location, client_id, submitted_at
      from surveys where archived_at is null and coalesce(trim(site_location), '') <> ''
    union all
    select lower(regexp_replace(trim(site_location), '[[:space:]]+', ' ', 'g')), site_location, client_id, submitted_at
      from installations where archived_at is null and coalesce(trim(site_location), '') <> ''
    union all
    select lower(regexp_replace(trim(site_location), '[[:space:]]+', ' ', 'g')), site_location, client_id, submitted_at
      from visits where archived_at is null and coalesce(trim(site_location), '') <> ''
  ),
  grouped as (
    -- Must build display_name and client_names exactly as site_summaries does.
    -- If the two disagree, a search counts a different number of groups than it
    -- lists and the pager contradicts what's on screen.
    select
      u.site_key,
      (array_agg(u.site_location order by u.submitted_at desc))[1] as display_name,
      array_remove(array_agg(distinct c.name), null) as client_names
    from unioned u
    left join clients c on c.id = u.client_id
    group by u.site_key
  )
  select count(*) from grouped
  where p_search is null
     or trim(p_search) = ''
     or display_name ilike '%' || trim(p_search) || '%'
     or exists (select 1 from unnest(client_names) n where n ilike '%' || trim(p_search) || '%');
$$;

grant execute on function public.site_summaries(text, integer, integer) to authenticated;
grant execute on function public.site_summaries_count(text) to authenticated;
