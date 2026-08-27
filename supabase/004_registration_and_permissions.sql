-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- Adds: (1) @linney.com-only registration, (2) client groups with per-account access.

-- ============================================================
-- 1. Give every account a role — 'user' (default) or 'super_admin'
-- ============================================================
alter table profiles add column if not exists role text not null default 'user';
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('user', 'super_admin'));

-- ============================================================
-- 2. Clients — the groups surveys get filed under
-- ============================================================
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

alter table clients enable row level security;

-- The public submission form needs to read this list too (no account required to submit).
create policy "Anyone can view the client list" on clients for select using (true);

-- No insert/update/delete policy is added on purpose — add clients yourself via
-- Supabase → Table Editor → clients. Keeping this admin-only-by-dashboard is simplest.

-- ============================================================
-- 3. Which accounts can see which clients
-- ============================================================
create table if not exists profile_clients (
  profile_id uuid references profiles(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  primary key (profile_id, client_id)
);

alter table profile_clients enable row level security;
-- No policies added here either — manage grants via Table Editor → profile_clients.
-- (Super admins bypass this table entirely, so it only needs entries for
-- non-super-admin accounts.)

-- ============================================================
-- 4. Tag each survey with a client
-- ============================================================
alter table surveys add column if not exists client_id uuid references clients(id);

-- ============================================================
-- 5. Helper functions — security definer so they can check profiles/profile_clients
-- from inside another table's policy without recursive permission issues
-- ============================================================
create or replace function public.is_super_admin()
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.has_client_access(check_client_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from profile_clients
    where profile_id = auth.uid() and client_id = check_client_id
  );
$$;

-- ============================================================
-- 6. Replace the old "any logged-in user sees everything" policies
-- ============================================================
drop policy if exists "Authenticated users can view surveys" on surveys;
create policy "Users can view surveys in their permitted client groups"
  on surveys for select
  using (public.is_super_admin() or public.has_client_access(client_id));

drop policy if exists "Authenticated users can delete surveys" on surveys;
create policy "Users can delete surveys in their permitted client groups"
  on surveys for delete
  using (public.is_super_admin() or public.has_client_access(client_id));

drop policy if exists "Authenticated users can delete survey photos" on storage.objects;
create policy "Super admins can delete survey photos"
  on storage.objects for delete
  using (bucket_id = 'survey-photos' and public.is_super_admin());

-- ============================================================
-- 7. Restrict new account registration to @linney.com addresses
-- (applies to self-registration AND accounts you add manually in the dashboard)
-- ============================================================
create or replace function public.check_linney_email()
returns trigger
language plpgsql security definer
as $$
begin
  if new.email !~* '@linney\.com$' then
    raise exception 'Only @linney.com email addresses can register.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_linney_email on auth.users;
create trigger enforce_linney_email
  before insert on auth.users
  for each row execute procedure public.check_linney_email();

-- ============================================================
-- 8. One-time manual step — DO NOT skip this
-- Make your own existing account a super admin so you keep seeing everything.
-- Find your user id in Supabase → Authentication → Users, then run:
--
--   update profiles set role = 'super_admin' where id = 'paste-your-user-id-here';
--
-- ============================================================
