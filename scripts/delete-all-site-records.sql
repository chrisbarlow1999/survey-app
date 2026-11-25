-- Delete ALL site surveys, install confirmations and engineer visits.
-- Run in Supabase → SQL Editor. PERMANENT — consider a backup first
-- (Database → Backups) if any of it might be wanted later.
--
-- DELETES
--   every survey (engineer surveys and client self-surveys), every install
--   confirmation, every engineer visit — archived ones included.
--
--   COST SHEETS: every cost sheet belongs to a survey, and the database deletes
--   a survey's cost sheets along with it. So deleting the surveys deletes the
--   cost sheets too. The script refuses unless you set also_delete_cost_sheets
--   to true below.
--
-- KEEPS
--   projects and their sites, tasks, notes and files; clients, accounts,
--   templates, hardware, the price list, menus and events. Projects that had
--   surveys linked just show none afterwards.
--
-- PHOTOS AND FILES
--   Survey/install/visit photos, signatures and attachments stay in storage as
--   unused files. Do NOT empty the "survey-photos" bucket to clear them — it
--   also holds project, request, RAMS and template files.
--
-- HOW TO RUN — two passes:
--   1. Run it as it is (just_check = true). It stops with a red message listing
--      exactly how many of each would be deleted. Nothing is changed.
--   2. If that's right, set just_check to false (and also_delete_cost_sheets to
--      true if there are cost sheets and you're happy to lose them), run again.

do $$
declare
  -- ===== SETTINGS =====================================================
  just_check              boolean := true;    -- true = preview only, false = really delete
  also_delete_cost_sheets boolean := false;   -- must be true if any cost sheets exist
  -- ====================================================================

  n_surveys integer;
  n_self    integer;
  n_installs integer;
  n_visits  integer;
  n_sheets  integer;
  n_sent    integer;
  summary   text;
begin
  n_surveys  := (select count(*) from surveys);
  n_self     := (select count(*) from surveys where survey_kind = 'self');
  n_installs := (select count(*) from installations);
  n_visits   := (select count(*) from visits);
  n_sheets   := (select count(*) from cost_sheets);
  n_sent     := (select count(*) from cost_sheets where approval_status <> 'not_sent');

  summary := format(
    E'\n  %s survey(s) (%s of them client self-surveys)\n  %s install confirmation(s)\n  %s engineer visit(s)\n  %s cost sheet(s) — deleted with their surveys%s',
    n_surveys, n_self, n_installs, n_visits, n_sheets,
    case when n_sent > 0 then format(E'\n    (%s of those have been sent to a client)', n_sent) else '' end);

  if just_check then
    raise exception E'CHECK ONLY — nothing was changed. Running with just_check = false would delete:%', summary;
  end if;

  if n_sheets > 0 and not also_delete_cost_sheets then
    raise exception E'There are % cost sheet(s), and deleting the surveys deletes them too. Set also_delete_cost_sheets to true if that''s OK. Nothing was changed.', n_sheets;
  end if;

  delete from cost_sheets;     -- explicit, rather than leaving it to the cascade
  delete from surveys;
  delete from installations;
  delete from visits;

  raise notice E'Deleted:%', summary;
end;
$$;

-- Check — after a real run every count should be 0.
select
  (select count(*) from surveys)       as surveys,
  (select count(*) from installations) as installations,
  (select count(*) from visits)        as visits,
  (select count(*) from cost_sheets)   as cost_sheets;
