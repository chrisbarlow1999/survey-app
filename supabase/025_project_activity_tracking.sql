-- Run this once in Supabase → SQL Editor, after 024.
--
-- Backs the "gone quiet" panel on the home page. Working out when a project
-- last moved by scanning project_activity every time the page loads would mean
-- pulling the whole activity table into memory; a maintained column makes it a
-- single indexed query that stays cheap however big the log gets.

alter table projects add column if not exists last_activity_at timestamptz;

-- Existing rows: best guess is the newest activity line, falling back to when
-- the project was raised.
update projects p
set last_activity_at = coalesce(
  (select max(a.created_at) from project_activity a where a.project_id = p.id),
  p.created_at
)
where p.last_activity_at is null;

alter table projects alter column last_activity_at set default now();

create index if not exists projects_last_activity_idx on projects (last_activity_at);

-- Every activity line moves the marker. Activity is written for status changes,
-- owner changes, tasks, template application and record links — i.e. all the
-- things that mean someone is actually working on it. Notes deliberately don't
-- write activity, so a chat-only project still counts as quiet; that's the
-- intent, since talking about a job isn't the same as progressing it.
create or replace function public.touch_project_last_activity()
returns trigger
language plpgsql security definer
as $$
begin
  update projects set last_activity_at = new.created_at where id = new.project_id;
  return new;
end;
$$;

drop trigger if exists project_activity_touches_project on project_activity;
create trigger project_activity_touches_project
  after insert on project_activity
  for each row
  execute function public.touch_project_last_activity();
