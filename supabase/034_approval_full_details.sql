-- Run this once in Supabase → SQL Editor, after 033.
--
-- Brings the client approval page up to what the Client PDF shows, so
-- "client-facing" means one thing across the app.
--
-- WHAT CHANGES
--   + site_contact  — on the Client PDF cover, missing from the approval page
--   + attachments   — floor plans, spec sheets; listed on the Client PDF
--   − engineer_first, engineer_last — the page never displayed these, but the
--     function still sent them to anyone holding a link, readable in the
--     browser's network tab. Engineer details were taken off client-facing
--     exports on request, and a public endpoint should honour that at the data
--     layer, not just by not rendering it.
--
-- Per-screen power, data/4G and notes, and each area's extra photos, were
-- already inside `locations` — the page simply never drew them. That part is a
-- page change with no migration.
--
-- WHAT IT STILL NEVER SENDS
-- Phone, resourcing estimates (engineer days, engineers required), internal
-- additional information and edit history. Those are the Client PDF's
-- internal-only fields, and here they're never selected at all.
--
-- The return columns change, and Postgres won't let CREATE OR REPLACE alter
-- them, so the old function has to go first. Dropping it also drops its
-- grants, which is why they're restated at the bottom — without them every
-- client approval link would stop working.

drop function if exists public.get_survey_for_approval(uuid);

create function public.get_survey_for_approval(p_token uuid)
returns table (
  id uuid,
  site_location text,
  address text,
  site_contact text,
  survey_date date,
  client_name text,
  locations jsonb,
  attachments jsonb,
  approval_status text,
  approval_name text,
  approval_comment text,
  approval_decided_at timestamptz
)
language sql
security definer
stable
-- Pinned so a same-named object in another schema can't be substituted into a
-- function that runs with elevated rights.
set search_path = public
as $$
  select
    s.id,
    s.site_location,
    s.address,
    s.site_contact,
    s.survey_date,
    c.name,
    s.locations,
    coalesce(s.attachments, '[]'::jsonb),
    s.approval_status,
    s.approval_name,
    s.approval_comment,
    s.approval_decided_at
  from surveys s
  left join clients c on c.id = s.client_id
  where s.approval_token = p_token
    and s.archived_at is null
    and s.approval_status <> 'not_sent'
  limit 1;
$$;

grant execute on function public.get_survey_for_approval(uuid) to anon, authenticated;
