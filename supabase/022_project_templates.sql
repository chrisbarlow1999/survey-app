-- Run this once in Supabase → SQL Editor, after 021.
--
-- Project templates: a named set of standard tasks (order hardware, arrange
-- survey, book install…) that gets copied onto a project so nobody types the
-- same checklist out again.
--
-- Two ways they get used:
--   * automatically, when a client raises a request through /request/<slug>
--   * manually, from a dropdown when a PM creates a project

create table if not exists project_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  -- null = available to every client. Set it to scope a template to one client.
  client_id uuid references clients(id) on delete cascade,
  -- The one applied automatically to incoming requests for this scope.
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists project_template_tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references project_templates(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  -- Days after the project is created that this task is due. Null = no date.
  due_offset_days integer
);

alter table project_templates enable row level security;
alter table project_template_tasks enable row level security;

create index if not exists project_template_tasks_template_idx on project_template_tasks (template_id, position);

-- At most one default per scope, otherwise "the" default is a coin toss. Two
-- partial indexes because a unique index over a nullable column doesn't treat
-- NULLs as equal, so the global default needs its own.
create unique index if not exists project_templates_default_per_client
  on project_templates (client_id) where is_default and client_id is not null;
create unique index if not exists project_templates_global_default
  on project_templates ((true)) where is_default and client_id is null;

-- Any internal account can read templates (they pick one when creating a
-- project); only super admins can change them.
drop policy if exists "Internal staff can view templates" on project_templates;
create policy "Internal staff can view templates"
  on project_templates for select using (public.is_internal_staff());

drop policy if exists "Super admins manage templates" on project_templates;
create policy "Super admins manage templates"
  on project_templates for all
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "Internal staff can view template tasks" on project_template_tasks;
create policy "Internal staff can view template tasks"
  on project_template_tasks for select using (public.is_internal_staff());

drop policy if exists "Super admins manage template tasks" on project_template_tasks;
create policy "Super admins manage template tasks"
  on project_template_tasks for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ============================================================
-- Auto-apply on client requests
-- ============================================================
-- This has to be a trigger, not app code. The person submitting /request/<slug>
-- is anonymous, and the project_tasks insert policy requires internal staff —
-- so the client can't write its own tasks. A security-definer trigger does it
-- on their behalf, after the project row lands.
--
-- Scoped to source = 'intake' so it never double-applies to a project a PM
-- created with a template already chosen in the form.
create or replace function public.apply_default_project_template()
returns trigger
language plpgsql security definer
as $$
declare
  tpl_id uuid;
  tpl_name text;
begin
  -- A template scoped to this client wins over the catch-all one.
  select id, name into tpl_id, tpl_name
  from project_templates
  where is_default and client_id = new.client_id
  limit 1;

  if tpl_id is null then
    select id, name into tpl_id, tpl_name
    from project_templates
    where is_default and client_id is null
    limit 1;
  end if;

  if tpl_id is null then
    return new;
  end if;

  insert into project_tasks (project_id, title, position, due_date)
  select
    new.id,
    t.title,
    t.position,
    case when t.due_offset_days is null then null
         else (current_date + t.due_offset_days) end
  from project_template_tasks t
  where t.template_id = tpl_id;

  insert into project_activity (project_id, actor_name, action, detail)
  values (new.id, 'System', 'Template applied', tpl_name);

  return new;
end;
$$;

drop trigger if exists apply_template_on_intake on projects;
create trigger apply_template_on_intake
  after insert on projects
  for each row
  when (new.source = 'intake')
  execute function public.apply_default_project_template();
