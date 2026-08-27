-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.

-- ============================================================
-- PROFILES — one row per logged-in dashboard user (PM/reviewer)
-- ============================================================
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);

-- Automatically create a profile row whenever a new account is created
-- (accounts themselves are created by you in Supabase Auth, not public sign-up).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- SURVEYS — engineers submit with no account; PMs read once logged in
-- ============================================================
create table if not exists surveys (
  id uuid default gen_random_uuid() primary key,
  engineer_first text not null,
  engineer_last text not null,
  phone text not null,
  survey_date date not null,
  site_location text not null,
  site_contact text,
  locations jsonb not null default '[]',   -- array of {photo_path, screen_size, orientation, measurements, power, data_port}
  engineer_days numeric,
  engineer_count numeric,
  additional_info text,
  submitted_at timestamptz default now()
);

alter table surveys enable row level security;

-- Anyone — including an anonymous engineer with no account — can submit a survey.
create policy "Anyone can submit a survey"
  on surveys for insert
  with check (true);

-- Only a logged-in (authenticated) user can read survey reports — this is the dashboard gate.
create policy "Authenticated users can view surveys"
  on surveys for select
  using (auth.role() = 'authenticated');

-- ============================================================
-- STORAGE — site photos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('survey-photos', 'survey-photos', false)
on conflict (id) do nothing;

create policy "Anyone can upload survey photos"
  on storage.objects for insert
  with check (bucket_id = 'survey-photos');

create policy "Authenticated users can view survey photos"
  on storage.objects for select
  using (bucket_id = 'survey-photos' and auth.role() = 'authenticated');
