-- ONE-OFF RESET — deletes every project. Not a migration; don't re-run it
-- once real projects are in.
--
-- Run in Supabase → SQL Editor. It cannot be undone, so consider taking a
-- backup first (Database → Backups) if anything here might be wanted later.
--
-- DELETES
--   every project, and with it: its sites, tasks, notes, activity trail,
--   RAMS records, tracking links and self-survey links.
--
-- KEEPS
--   accounts and logins, clients and request-form links, project templates,
--   the price catalogue and client rates, surveys (including self surveys),
--   install confirmations, engineer visits, cost sheets, menus and events.
--   Surveys, installs and visits that were linked to a project are kept but
--   unlinked, so they show as "Not linked to a project".
--
-- FILES
--   Uploaded files (project attachments, RAMS, request attachments) are left
--   in storage. Project files can be shared by path with templates, so
--   deleting them here could break a template's files. They're harmless
--   orphans.

-- 1. Preview — run this on its own first to see what will go.
select
  (select count(*) from projects)          as projects,
  (select count(*) from project_sites)     as sites,
  (select count(*) from project_tasks)     as tasks,
  (select count(*) from project_notes)     as notes,
  (select count(*) from project_activity)  as activity_rows,
  (select count(*) from surveys where project_id is not null)       as surveys_to_unlink,
  (select count(*) from installations where project_id is not null) as installs_to_unlink,
  (select count(*) from visits where project_id is not null)        as visits_to_unlink;

-- 2. The reset. All or nothing: if any step fails, nothing is deleted.
begin;

-- Unlink the site records being kept. surveys.project_site_id would be nulled
-- by its own foreign key, but clearing it here keeps it explicit.
update surveys       set project_id = null, project_site_id = null where project_id is not null;
update installations set project_id = null where project_id is not null;
update visits        set project_id = null where project_id is not null;

-- Sites first, on their own: their triggers update the parent project, which
-- is simplest while that project still exists.
delete from project_sites;

-- Tasks, notes and activity go with their projects (on delete cascade).
delete from projects;

commit;

-- 3. Check — every count should be 0.
select
  (select count(*) from projects)         as projects,
  (select count(*) from project_sites)    as sites,
  (select count(*) from project_tasks)    as tasks,
  (select count(*) from project_notes)    as notes,
  (select count(*) from project_activity) as activity_rows;
