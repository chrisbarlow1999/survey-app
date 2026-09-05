-- Run this once in Supabase → SQL Editor, after 029.
--
-- Adds the booked install date to projects, so the table view can answer "what
-- is going in, when" rather than only "when did the client ask for it".
--
-- WHY NOT REUSE due_date
-- due_date is the client's deadline — it's labelled "Needed By" on the public
-- request form and a client sets it themselves. The install date is ours: when
-- engineers are actually booked. They're routinely different, and conflating
-- them would mean a slipped install silently rewrites what the client asked
-- for. The 'install_booked' status already implies this date exists; this gives
-- it somewhere to live.
--
-- WHY NOT DERIVE IT FROM THE LINKED INSTALL RECORD
-- An install confirmation is submitted after the engineer has been on site, so
-- its install_date is history. This column is a forecast — it has to be set
-- before the work happens, which is the whole point of putting it in a
-- management view.

alter table projects add column if not exists install_date date;

-- Sorting and filtering the table view by this column; the partial index skips
-- the majority of rows that have no date yet.
create index if not exists projects_install_date_idx
  on projects (install_date) where install_date is not null;

-- ============================================================
-- Re-state the intake insert policy
-- ============================================================
-- The policy doesn't enumerate columns, so without this a script posting
-- straight at PostgREST could set install_date on an anonymous request — a
-- client booking their own install slot. They may still ask for a deadline
-- (due_date); scheduling stays internal.
drop policy if exists "Anyone can submit an intake request" on projects;
create policy "Anyone can submit an intake request"
  on projects for insert
  with check (
    source = 'intake'
    and status = 'new'
    and archived_at is null
    and install_date is null
    and jsonb_array_length(coalesce(attachments, '[]'::jsonb)) <= 10
    and length(coalesce(title, '')) between 1 and 300
    and length(coalesce(description, '')) <= 5000
    and (screen_count is null or screen_count between 0 and 500)
    and exists (
      select 1 from clients c
      where c.id = client_id and c.intake_enabled
    )
  );
