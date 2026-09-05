-- Run this once in Supabase → SQL Editor, after 026.
--
-- Closes the loop the Client PDF was built for. Until now the PDF replaced the
-- PowerPoint document but not the approval conversation — you emailed it, the
-- client replied, and nothing came back into the system.
--
-- A survey gets an unguessable token. Anyone holding it can see the
-- client-facing view of that ONE survey and record an Approve or Request
-- Changes decision against it. No account, no access to anything else.

alter table surveys add column if not exists approval_token uuid not null default gen_random_uuid();
alter table surveys add column if not exists approval_status text not null default 'not_sent';
alter table surveys add column if not exists approval_name text;
alter table surveys add column if not exists approval_comment text;
alter table surveys add column if not exists approval_decided_at timestamptz;
alter table surveys add column if not exists approval_sent_at timestamptz;

-- not_sent → awaiting → approved | changes_requested
alter table surveys drop constraint if exists surveys_approval_status_check;
alter table surveys add constraint surveys_approval_status_check
  check (approval_status in ('not_sent', 'awaiting', 'approved', 'changes_requested'));

create unique index if not exists surveys_approval_token_key on surveys (approval_token);

-- ============================================================
-- Reading a survey by token
-- ============================================================
-- Security definer because RLS gives anonymous users no select on surveys at
-- all. The function is the entire public surface: it takes a token and returns
-- one survey, with the internal-only columns (phone, resourcing estimates,
-- internal notes, edit history) simply never selected — the client PDF hides
-- them with CSS, but a public endpoint shouldn't be sending them at all.
--
-- Returns nothing for an unknown token, an archived survey, or one that hasn't
-- been sent for approval, so the URL can be revoked by archiving.
create or replace function public.get_survey_for_approval(p_token uuid)
returns table (
  id uuid,
  site_location text,
  address text,
  survey_date date,
  engineer_first text,
  engineer_last text,
  client_name text,
  locations jsonb,
  approval_status text,
  approval_name text,
  approval_comment text,
  approval_decided_at timestamptz
)
language sql
security definer
stable
as $$
  select
    s.id, s.site_location, s.address, s.survey_date,
    s.engineer_first, s.engineer_last,
    c.name,
    s.locations,
    s.approval_status, s.approval_name, s.approval_comment, s.approval_decided_at
  from surveys s
  left join clients c on c.id = s.client_id
  where s.approval_token = p_token
    and s.archived_at is null
    and s.approval_status <> 'not_sent'
  limit 1;
$$;

-- ============================================================
-- Recording a decision
-- ============================================================
-- Also security definer, and deliberately narrow: it can only ever set the
-- approval columns, so holding a token gives no route to editing the survey.
-- A decision can be changed (a client who asked for changes may approve later)
-- but the survey must already be awaiting or decided — you can't approve one
-- that was never sent.
create or replace function public.submit_survey_approval(
  p_token uuid,
  p_decision text,
  p_name text,
  p_comment text
)
returns boolean
language plpgsql
security definer
as $$
declare
  updated integer;
begin
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'Invalid decision';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'A name is required';
  end if;

  update surveys
  set approval_status = p_decision,
      approval_name = left(trim(p_name), 200),
      approval_comment = left(coalesce(p_comment, ''), 4000),
      approval_decided_at = now()
  where approval_token = p_token
    and archived_at is null
    and approval_status <> 'not_sent';

  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

grant execute on function public.get_survey_for_approval(uuid) to anon, authenticated;
grant execute on function public.submit_survey_approval(uuid, text, text, text) to anon, authenticated;
