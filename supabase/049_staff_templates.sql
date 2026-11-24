-- Run this once in Supabase → SQL Editor, after 048.
--
-- Staff (role 'user') can now see project templates, and create their own.
--
--   • Everyone internal could already READ templates (022) — the New Project
--     form needs them. Nothing changes there.
--   • Staff can create templates, and edit or delete the ones THEY created.
--   • Other people's templates are read-only to them.
--   • Auto-applied templates (is_default) stay super-admin only: they're stamped
--     onto every incoming client request, so a staff member can't make a
--     template auto-applied, and can't edit one of theirs once a super admin has.
--   • A staff template can only be scoped to a client that person has access to
--     (or to all clients).
--
-- Super admins keep full control through the existing "Super admins manage
-- templates" policies.

alter table project_templates
  add column if not exists created_by uuid references profiles(id) on delete set null default auth.uid();

create index if not exists project_templates_created_by_idx on project_templates (created_by);

-- ============================================================
-- Templates
-- ============================================================
drop policy if exists "Staff can create templates" on project_templates;
create policy "Staff can create templates"
  on project_templates for insert
  with check (
    public.is_internal_staff()
    and created_by = auth.uid()
    and not is_default
    and (client_id is null or public.has_client_access(client_id))
  );

drop policy if exists "Staff can edit their own templates" on project_templates;
create policy "Staff can edit their own templates"
  on project_templates for update
  using (public.is_internal_staff() and created_by = auth.uid() and not is_default)
  with check (
    public.is_internal_staff()
    and created_by = auth.uid()
    and not is_default
    and (client_id is null or public.has_client_access(client_id))
  );

drop policy if exists "Staff can delete their own templates" on project_templates;
create policy "Staff can delete their own templates"
  on project_templates for delete
  using (public.is_internal_staff() and created_by = auth.uid() and not is_default);

-- So the Templates page can offer staff only the clients they may scope a
-- template to. Their own grants only — nobody else's.
drop policy if exists "Users can see their own client access" on profile_clients;
create policy "Users can see their own client access"
  on profile_clients for select
  using (profile_id = auth.uid());

-- ============================================================
-- Template tasks — follow their template
-- ============================================================
create or replace function public.owns_editable_template(p_template uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from project_templates
    where id = p_template and created_by = auth.uid() and not is_default
  ) and public.is_internal_staff();
$$;

drop policy if exists "Staff can add tasks to their own templates" on project_template_tasks;
create policy "Staff can add tasks to their own templates"
  on project_template_tasks for insert
  with check (public.owns_editable_template(template_id));

drop policy if exists "Staff can edit tasks on their own templates" on project_template_tasks;
create policy "Staff can edit tasks on their own templates"
  on project_template_tasks for update
  using (public.owns_editable_template(template_id))
  with check (public.owns_editable_template(template_id));

drop policy if exists "Staff can remove tasks from their own templates" on project_template_tasks;
create policy "Staff can remove tasks from their own templates"
  on project_template_tasks for delete
  using (public.owns_editable_template(template_id));
