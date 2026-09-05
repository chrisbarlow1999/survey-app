-- Run this once in Supabase → SQL Editor, after 023.
--
-- Site History groups records by a plain text match on the site name, so a
-- typo forks a site's history in two. The data already shows it happening —
-- "Barlow Manor", "Barlowz", "Barlows Mansion". This backs an autocomplete on
-- the public forms so engineers pick an existing name instead of retyping it.
--
-- It has to be a security-definer function: the people filling those forms are
-- anonymous, and the RLS on surveys/installations/visits is insert-only for
-- them. They can't read back a list of site names any other way.
--
-- What it exposes is deliberately narrow — distinct site names for ONE client
-- id, nothing else. Client ids and names are already public (the forms show a
-- client dropdown), so this adds site names to that same surface. If venue
-- names are ever considered sensitive, drop the grant to anon and the
-- autocomplete quietly stops suggesting.

create or replace function public.site_name_suggestions(p_client_id uuid)
returns table (site_location text)
language sql
security definer
stable
as $$
  select distinct s.site_location
  from (
    select site_location, client_id, archived_at from surveys
    union all
    select site_location, client_id, archived_at from installations
    union all
    select site_location, client_id, archived_at from visits
  ) s
  where s.client_id = p_client_id
    and s.archived_at is null
    and s.site_location is not null
    and length(trim(s.site_location)) > 0
  order by s.site_location
  limit 200;
$$;

-- Locked to this one function; it does not open up the underlying tables.
grant execute on function public.site_name_suggestions(uuid) to anon, authenticated;
