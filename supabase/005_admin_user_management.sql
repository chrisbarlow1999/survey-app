-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- Adds an in-app "User Permissions" admin page for super admins: view every
-- account, change roles, and grant/revoke which clients each account can see.

-- ============================================================
-- 1. Store each account's email on its profile row.
-- auth.users isn't readable from the browser client, so we mirror the email
-- onto profiles (which already has RLS policies we control) at signup time.
-- ============================================================
alter table profiles add column if not exists email text;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Backfill emails for accounts created before this migration.
update profiles
set email = auth.users.email
from auth.users
where profiles.id = auth.users.id and profiles.email is null;

-- ============================================================
-- 2. Let super admins see and manage every profile (previously each account
-- could only see its own row, and nobody could update roles at all).
-- ============================================================
create policy "Super admins can view all profiles"
  on profiles for select
  using (public.is_super_admin());

create policy "Super admins can update profiles"
  on profiles for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============================================================
-- 3. Let super admins read and edit client access grants.
-- (profile_clients had RLS enabled with zero policies, so only Table Editor
-- / SQL Editor could touch it — this opens it up to the new admin page.)
-- ============================================================
create policy "Super admins can view client grants"
  on profile_clients for select
  using (public.is_super_admin());

create policy "Super admins can grant client access"
  on profile_clients for insert
  with check (public.is_super_admin());

create policy "Super admins can revoke client access"
  on profile_clients for delete
  using (public.is_super_admin());
