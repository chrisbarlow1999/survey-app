-- Run this once in Supabase → SQL Editor, after 020.
--
-- The chat-style log on a project: the running commentary that doesn't fit a
-- field or a task ("install date of 21st/22nd requested", "deadline of 11/09
-- given to hit those dates"). Kept separate from project_activity, which is the
-- automatic audit trail — this one is written by people, on purpose.

create table if not exists project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author_id uuid references profiles(id),
  -- Snapshot of the name, same reasoning as edit_history: deleting an account
  -- shouldn't blank out who said what.
  author_name text,
  body text not null,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

alter table project_notes enable row level security;

create index if not exists project_notes_project_id_idx on project_notes (project_id, created_at);

drop policy if exists "Project access governs note select" on project_notes;
create policy "Project access governs note select"
  on project_notes for select using (public.can_access_project(project_id));

drop policy if exists "Project access governs note insert" on project_notes;
create policy "Project access governs note insert"
  on project_notes for insert with check (public.can_access_project(project_id));

-- You can edit and delete your own notes, nobody else's. A super admin can
-- clear up anything, which is the escape hatch for someone leaving mid-thread.
drop policy if exists "Authors can update their own notes" on project_notes;
create policy "Authors can update their own notes"
  on project_notes for update
  using (author_id = auth.uid() and public.can_access_project(project_id))
  with check (author_id = auth.uid() and public.can_access_project(project_id));

drop policy if exists "Authors and admins can delete notes" on project_notes;
create policy "Authors and admins can delete notes"
  on project_notes for delete
  using (
    public.can_access_project(project_id)
    and (author_id = auth.uid() or public.is_super_admin())
  );
