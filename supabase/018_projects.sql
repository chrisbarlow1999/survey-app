-- Run this once in Supabase → SQL Editor, after all previous migrations.
-- Adds the project management side: projects, their task lists, an activity
-- log, and per-client intake URLs that create a project without an account.
--
-- Deliberately NOT visible to client_viewer accounts. Projects carry internal
-- commentary and internal task assignments; a client-facing view is a separate
-- decision to make once the shape has settled in real use. Every policy below
-- therefore requires is_internal_staff(), unlike surveys/installs/visits which
-- allow any role with client access to read.

-- ============================================================
-- 1. Per-client intake URLs
-- ============================================================
-- slug drives /request/<slug>. intake_enabled is the kill switch: turning it
-- off closes the public form for that client without deleting the slug, and
-- the RLS policy below reads it, so it's enforced in Postgres and not just the
-- UI.
alter table clients add column if not exists slug text;
alter table clients add column if not exists intake_enabled boolean not null default false;

create unique index if not exists clients_slug_key on clients (slug) where slug is not null;

-- ============================================================
-- 2. Projects
-- ============================================================
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  title text not null,
  reference text,
  site_location text,
  address text,
  description text,
  -- Who asked for it. Free text because intake submitters have no account.
  requested_by text,
  requester_email text,
  status text not null default 'new',
  priority text not null default 'normal',
  due_date date,
  -- 'manual' (created by a PM) or 'intake' (came in via /request/<slug>).
  source text not null default 'manual',
  created_by uuid references profiles(id),
  attachments jsonb not null default '[]',
  edit_history jsonb not null default '[]',
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- No check constraint on status/priority on purpose: the allowed values live in
-- lib/projectStatus.js so the workflow can be reshaped without a migration
-- while this is still bedding in. Only internal staff can write, so the values
-- can only come from the app.

alter table projects enable row level security;

create index if not exists projects_client_id_idx on projects (client_id);
create index if not exists projects_archived_at_idx on projects (archived_at);
create index if not exists projects_status_idx on projects (status);

-- Anonymous intake submissions. Locked down hard: they may only create a 'new',
-- unarchived, intake-sourced project, and only for a client that has intake
-- switched on. Without the intake_enabled check, knowing any client_id would be
-- enough to post work into someone's queue.
drop policy if exists "Anyone can submit an intake request" on projects;
create policy "Anyone can submit an intake request"
  on projects for insert
  with check (
    source = 'intake'
    and status = 'new'
    and archived_at is null
    and exists (
      select 1 from clients c
      where c.id = client_id and c.intake_enabled
    )
  );

drop policy if exists "Internal staff can create projects" on projects;
create policy "Internal staff can create projects"
  on projects for insert
  with check (
    public.is_super_admin()
    or (public.is_internal_staff() and public.has_client_access(client_id))
  );

drop policy if exists "Internal staff can view projects" on projects;
create policy "Internal staff can view projects"
  on projects for select
  using (
    public.is_super_admin()
    or (public.is_internal_staff() and public.has_client_access(client_id))
  );

drop policy if exists "Internal staff can update projects" on projects;
create policy "Internal staff can update projects"
  on projects for update
  using (
    public.is_super_admin()
    or (public.is_internal_staff() and public.has_client_access(client_id))
  )
  with check (
    public.is_super_admin()
    or (public.is_internal_staff() and public.has_client_access(client_id))
  );

drop policy if exists "Internal staff can delete projects" on projects;
create policy "Internal staff can delete projects"
  on projects for delete
  using (
    public.is_super_admin()
    or (public.is_internal_staff() and public.has_client_access(client_id))
  );

-- ============================================================
-- 3. Colleagues can see each other's names
-- ============================================================
-- Until now a plain 'user' account could only read its OWN profile row (see
-- schema.sql); only super admins could read all of them. Task assignment needs
-- every PM to see the list of internal colleagues, otherwise the assignee
-- dropdown is empty for everyone but a super admin.
--
-- Scoped to internal staff reading internal staff: client_viewer accounts get
-- nothing new, and nobody gains access to client_viewer rows. is_internal_staff()
-- is security definer, so calling it from a policy ON profiles doesn't recurse.
drop policy if exists "Internal staff can view internal profiles" on profiles;
create policy "Internal staff can view internal profiles"
  on profiles for select
  using (public.is_internal_staff() and role in ('user', 'super_admin'));

-- ============================================================
-- 4. Access helper for the child tables
-- ============================================================
-- Tasks and activity have no client_id of their own — they inherit whoever can
-- see the parent project. Wrapping that in a security-definer function keeps
-- the child policies short and stops them drifting from the parent's rules.
create or replace function public.can_access_project(check_project_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from projects p
    where p.id = check_project_id
      and (
        public.is_super_admin()
        or (public.is_internal_staff() and public.has_client_access(p.client_id))
      )
  );
$$;

-- ============================================================
-- 5. Tasks
-- ============================================================
-- completed_at doubles as the done flag (null = still open) so the report can
-- show when something was finished, not just that it was.
create table if not exists project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  notes text,
  assignee_id uuid references profiles(id),
  due_date date,
  position integer not null default 0,
  completed_at timestamptz,
  completed_by text,
  created_at timestamptz not null default now()
);

alter table project_tasks enable row level security;

create index if not exists project_tasks_project_id_idx on project_tasks (project_id);
create index if not exists project_tasks_assignee_idx on project_tasks (assignee_id);

drop policy if exists "Project access governs task select" on project_tasks;
create policy "Project access governs task select"
  on project_tasks for select using (public.can_access_project(project_id));

drop policy if exists "Project access governs task insert" on project_tasks;
create policy "Project access governs task insert"
  on project_tasks for insert with check (public.can_access_project(project_id));

drop policy if exists "Project access governs task update" on project_tasks;
create policy "Project access governs task update"
  on project_tasks for update
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

drop policy if exists "Project access governs task delete" on project_tasks;
create policy "Project access governs task delete"
  on project_tasks for delete using (public.can_access_project(project_id));

-- ============================================================
-- 6. Activity log
-- ============================================================
-- Append-only: select and insert only, no update or delete policy, so history
-- can't be quietly rewritten. actor_name is a text snapshot for the same reason
-- edit_history stores a name — deleting an account shouldn't blank the trail.
create table if not exists project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  actor_name text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

alter table project_activity enable row level security;

create index if not exists project_activity_project_id_idx on project_activity (project_id, created_at desc);

drop policy if exists "Project access governs activity select" on project_activity;
create policy "Project access governs activity select"
  on project_activity for select using (public.can_access_project(project_id));

drop policy if exists "Project access governs activity insert" on project_activity;
create policy "Project access governs activity insert"
  on project_activity for insert with check (public.can_access_project(project_id));

-- ============================================================
-- 7. Link the existing record types to a project
-- ============================================================
-- Nullable, and set by a PM after the fact — engineers submitting the public
-- forms have no idea which project a job belongs to. Unlike the survey/install
-- relationship (deliberately unlinked), both hang off the same project.
alter table surveys add column if not exists project_id uuid references projects(id);
alter table installations add column if not exists project_id uuid references projects(id);
alter table visits add column if not exists project_id uuid references projects(id);

create index if not exists surveys_project_id_idx on surveys (project_id);
create index if not exists installations_project_id_idx on installations (project_id);
create index if not exists visits_project_id_idx on visits (project_id);
