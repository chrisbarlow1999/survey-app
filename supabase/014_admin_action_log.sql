-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- Logs admin actions (account created, role changed, password reset, account
-- deactivated, client access granted/revoked, client added/renamed/deleted) so
-- there's a record of who did what if more than one person has super admin.
--
-- actor_id defaults to auth.uid() so client-side inserts (role changes, client
-- edits) don't need to pass it explicitly, and the insert policy below stops
-- anyone from spoofing a different actor. Server-side API routes (which use
-- the service role key, bypassing RLS and auth.uid() entirely) set actor_id
-- explicitly instead, using the already-verified caller.

create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null default auth.uid(),
  action text not null,
  target text,
  details jsonb not null default '{}',
  created_at timestamptz default now()
);

alter table admin_actions enable row level security;

create policy "Super admins can view admin actions"
  on admin_actions for select
  using (public.is_super_admin());

create policy "Super admins can log admin actions"
  on admin_actions for insert
  with check (public.is_super_admin() and (actor_id = auth.uid() or actor_id is null));
