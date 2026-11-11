-- Run this once in Supabase → SQL Editor, after 040.
--
-- Turns the schedule into a real calendar: which firm is booked to do an
-- install, and at what time.
--
-- PLANNED, NOT ACTUAL
-- surveys/installations/visits already carry engineer_company (migration 035),
-- but that is filled in by the engineer when they submit the form — it records
-- who turned up, after the fact. You cannot schedule against it. install_company
-- here is the opposite: who we have booked, set in advance by a PM. The two are
-- deliberately separate, and comparing them is how you'd later spot a job that
-- was passed to a different firm than the one it was given to.
--
-- The name is free text, not a foreign key, for the same reason as 035: the
-- list lives in lib/engineerCompanies.js so adding a firm is a one-line edit,
-- and a one-off typed under "Other" has to be storable.
--
-- TIMES ARE OPTIONAL
-- Every install already booked has a date and no time. Those stay valid and
-- show on the calendar as all-day, so nothing that is already in the diary
-- breaks or disappears. A finish time is optional even when a start is set —
-- plenty of jobs are booked as "09:00 start" with no agreed end.

alter table projects add column if not exists install_company text;
alter table projects add column if not exists install_start_time time;
alter table projects add column if not exists install_end_time time;

comment on column projects.install_company is
  'Firm booked to do the install, set in advance by a PM. Distinct from engineer_company on the submitted record, which is who actually attended. Options live in lib/engineerCompanies.js.';

alter table projects drop constraint if exists projects_install_company_len;
alter table projects add constraint projects_install_company_len
  check (install_company is null or length(install_company) between 1 and 80);

-- A finish before its start is a typo, not a booking.
alter table projects drop constraint if exists projects_install_times_ordered;
alter table projects add constraint projects_install_times_ordered check (
  install_start_time is null
  or install_end_time is null
  or install_end_time > install_start_time
);

-- A time with no date has nowhere to sit on a calendar, so it can only ever be
-- confusing. Cleared alongside the date by the app; this is the backstop.
alter table projects drop constraint if exists projects_install_times_need_date;
alter table projects add constraint projects_install_times_need_date check (
  install_date is not null
  or (install_start_time is null and install_end_time is null)
);

-- The calendar groups by company within a date range; install_date already has
-- its own index from migration 030.
create index if not exists projects_install_company_idx
  on projects (install_company) where install_company is not null;

-- ============================================================
-- Re-state the intake insert policy
-- ============================================================
-- The policy doesn't enumerate columns, so without this a script posting
-- straight at PostgREST could book itself an engineer and a time slot. Same
-- reasoning as install_date in 030 and value_gbp in 032: a client may ask for a
-- deadline, but scheduling is ours.
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
    and jsonb_array_length(coalesce(attachments, '[]'::jsonb)) <= 10
    and length(coalesce(title, '')) between 1 and 300
    and length(coalesce(description, '')) <= 5000
    and (screen_count is null or screen_count between 0 and 500)
    and exists (
      select 1 from clients c
      where c.id = client_id and c.intake_enabled
    )
  );
