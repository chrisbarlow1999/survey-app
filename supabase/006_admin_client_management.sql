-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- Lets super admins add/rename/delete clients from the /admin page instead of
-- needing Supabase's Table Editor.

create policy "Super admins can insert clients"
  on clients for insert
  with check (public.is_super_admin());

create policy "Super admins can update clients"
  on clients for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Super admins can delete clients"
  on clients for delete
  using (public.is_super_admin());

-- Note: deleting a client that still has surveys pointing at it will fail
-- (surveys.client_id references clients with no cascade) — that's intentional,
-- it stops a client from being deleted out from under existing survey data.
