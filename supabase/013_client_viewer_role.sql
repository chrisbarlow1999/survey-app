-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- Adds a third role, 'client_viewer' — for an external client's own contact to
-- log in and see only their own client's surveys/installations, read-only.
--
-- Reuses the exact same profile_clients grant mechanism as internal 'user'
-- accounts (has_client_access already works unchanged for viewing), but
-- update/delete must now require being INTERNAL staff, not just having
-- client access — otherwise a client viewer with access would also be able
-- to edit or delete records, which defeats the point.

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('user', 'super_admin', 'client_viewer'));

create or replace function public.is_internal_staff()
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('user', 'super_admin')
  );
$$;

-- Surveys: view stays open to anyone with client access (any role); edit/delete
-- now require internal staff too.
drop policy if exists "Users can update surveys in their permitted client groups" on surveys;
create policy "Internal staff can update surveys in their permitted client groups"
  on surveys for update
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)))
  with check (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

drop policy if exists "Users can delete surveys in their permitted client groups" on surveys;
create policy "Internal staff can delete surveys in their permitted client groups"
  on surveys for delete
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

-- Installations: same treatment.
drop policy if exists "Users can update installations in their permitted client groups" on installations;
create policy "Internal staff can update installations in their permitted client groups"
  on installations for update
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)))
  with check (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

drop policy if exists "Users can delete installations in their permitted client groups" on installations;
create policy "Internal staff can delete installations in their permitted client groups"
  on installations for delete
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));
