-- Run this once in Supabase → SQL Editor, after 019.
--
-- Moves ownership from the task up to the project. A project is now owned by
-- one internal person — the PM answerable for it — and tasks are just a
-- checklist underneath them. Per-task assignees turned out to be the wrong
-- grain: the field engineers have no accounts, so every task was ultimately
-- owned by the same PM anyway.

alter table projects add column if not exists owner_id uuid references profiles(id);
create index if not exists projects_owner_id_idx on projects (owner_id);

-- Destructive, and intentionally so — this drops any task assignments already
-- entered. Dropping the column takes its index with it.
alter table project_tasks drop column if exists assignee_id;

-- Note: the "Internal staff can view internal profiles" policy added in 018 is
-- still needed. It was introduced for the task assignee dropdown; it now feeds
-- the project Owner dropdown instead. Don't drop it.
