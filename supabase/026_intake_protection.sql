-- Run this once in Supabase → SQL Editor, after 025.
--
-- The client request form is a public URL that creates rows and accepts file
-- uploads. The honeypot and timing checks on the form itself stop bots, but
-- both live in the browser and a script hitting PostgREST directly skips them
-- entirely. This is the part that can't be skipped.
--
-- It stops casual abuse and runaway scripts. It is NOT protection against a
-- determined, targeted attacker — for that you'd want a CAPTCHA or an edge
-- rate limiter in front of the API.

-- ============================================================
-- 1. Cap what a single request can carry
-- ============================================================
-- Tightens the anonymous insert policy from 018 rather than replacing its
-- meaning: same rules, plus a ceiling on attachments so one submission can't
-- be used to bulk-load the storage bucket.
drop policy if exists "Anyone can submit an intake request" on projects;
create policy "Anyone can submit an intake request"
  on projects for insert
  with check (
    source = 'intake'
    and status = 'new'
    and archived_at is null
    and jsonb_array_length(coalesce(attachments, '[]'::jsonb)) <= 10
    and length(coalesce(title, '')) between 1 and 300
    and length(coalesce(description, '')) <= 5000
    and exists (
      select 1 from clients c
      where c.id = client_id and c.intake_enabled
    )
  );

-- ============================================================
-- 2. Rate limit per client
-- ============================================================
-- Deliberately per client rather than per IP: PostgREST doesn't hand the
-- client address to row-level triggers reliably, and the thing worth protecting
-- is a client's queue, not the server.
--
-- A real client raising ten requests in an hour is already unusual; a script
-- would blow past it immediately. Raise HOURLY_LIMIT if a rollout genuinely
-- needs more.
create or replace function public.enforce_intake_rate_limit()
returns trigger
language plpgsql security definer
as $$
declare
  recent_count integer;
  hourly_limit constant integer := 10;
begin
  select count(*) into recent_count
  from projects
  where client_id = new.client_id
    and source = 'intake'
    and created_at > now() - interval '1 hour';

  if recent_count >= hourly_limit then
    raise exception 'Too many requests for this client in the last hour. Please try again later.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists intake_rate_limit on projects;
create trigger intake_rate_limit
  before insert on projects
  for each row
  when (new.source = 'intake')
  execute function public.enforce_intake_rate_limit();
