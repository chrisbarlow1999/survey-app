-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- Lets a PM edit a survey from the dashboard, using the same client-permission
-- rule that already governs viewing and deleting (super admin, or granted access
-- to that survey's client).

create policy "Users can update surveys in their permitted client groups"
  on surveys for update
  using (public.is_super_admin() or public.has_client_access(client_id))
  with check (public.is_super_admin() or public.has_client_access(client_id));

-- Note: replacing a photo during an edit uploads the new one fine (anyone can
-- insert into the survey-photos bucket), but cleaning up the OLD file from
-- storage is still restricted to super admins (storage.objects delete policy
-- from migration 004). For a non-super-admin edit, the app still saves
-- correctly — the old file is just left behind in storage rather than deleted.
