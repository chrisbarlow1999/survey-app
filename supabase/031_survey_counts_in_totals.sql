-- Run this once in Supabase → SQL Editor, after 030.
--
-- Lets a PM overrule the "latest survey per site" rule that /projects/screens
-- uses, one survey at a time.
--
-- WHY AN OVERRIDE IS NEEDED AT ALL
-- The automatic rule keeps the newest survey for each project + site name and
-- sets the older ones aside, because a re-survey after the client asks for
-- changes replaces what came before it. That's right for a re-survey and wrong
-- for a site surveyed in phases — ground floor in January, first floor in
-- March, both typed as the same site name. Nothing in the data distinguishes
-- the two cases, and guessing from area names would be worse than asking.
--
-- WHY PER SURVEY AND NOT A FLAG ON THE PROJECT
-- A "count every survey" tick on the project is all-or-nothing. A multi-site
-- project that has both phased surveys AND one genuine re-survey would then
-- double-count the re-survey, and quietly over-order screens. Per survey, the
-- question only comes up where two surveys actually clash.
--
-- THREE STATES, NOT TWO
--   null  — use the automatic rule (the default, and what every existing row
--           gets, so nothing changes until someone intervenes)
--   true  — always count this survey
--   false — never count it
-- A plain boolean defaulting to true would have thrown the automatic rule away
-- and made every re-survey a manual job.

alter table surveys add column if not exists counts_in_totals boolean;

comment on column surveys.counts_in_totals is
  'null = apply the latest-survey-per-site rule; true = always count; false = never count. See lib/surveyScreens.js.';

-- ============================================================
-- Keep the public form out of it
-- ============================================================
-- The insert policy is `with check (true)` — engineers have no accounts, so
-- anyone can file a survey. That also means anyone posting straight at
-- PostgREST could set this column and pin their own survey into, or out of,
-- the procurement figures. It is a PM decision made after the fact, so an
-- insert may not carry one at all.
drop policy if exists "Anyone can submit a survey" on surveys;
create policy "Anyone can submit a survey"
  on surveys for insert
  with check (counts_in_totals is null);

-- Updating it stays governed by the existing survey update policy from
-- migration 013 (super admin, or internal staff with access to that client),
-- so a client_viewer cannot change what the pipeline reports.
