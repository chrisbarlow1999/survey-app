-- Run this once in Supabase → SQL Editor, after 018_projects.sql.
--
-- 018 added clients.slug but only new clients get one filled in (the admin page
-- derives it on insert). Every client that already existed was left with a null
-- slug, so their request form had no URL and nothing showed on Admin → Clients.
-- This fills in the gap.
--
-- Safe to re-run: it only touches rows where slug is still null, so a slug you
-- have since edited by hand is never overwritten.

with generated as (
  select
    id,
    left(
      regexp_replace(
        regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'),
        '^-+|-+$', '', 'g'
      ),
      40
    ) as base
  from clients
  where slug is null
),
-- Two clients whose names reduce to the same slug would collide on the unique
-- index, so everything after the first gets a numeric suffix.
numbered as (
  select id, base, row_number() over (partition by base order by id) as rn
  from generated
  where base <> ''
)
update clients c
set slug = case when n.rn = 1 then n.base else n.base || '-' || n.rn end
from numbered n
where c.id = n.id
  -- Skip anything that would clash with a slug already in use.
  and not exists (
    select 1 from clients existing
    where existing.slug = (case when n.rn = 1 then n.base else n.base || '-' || n.rn end)
  );

-- Note: intake_enabled is deliberately NOT switched on here. Every client now
-- has a URL ready, but each request form stays closed until someone turns it on
-- from Admin → Clients.
