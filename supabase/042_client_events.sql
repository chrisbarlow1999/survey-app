-- Run this once in Supabase → SQL Editor, after 041.
--
-- What's on at client venues, so the content team can chase artwork before it's
-- last minute instead of running a prompt every Monday.
--
-- THREE TABLES
--   event_venues    the watch list — which venues we care about
--   venue_events    the events themselves, drafted or entered by hand
--   event_ai_runs   a log of each AI draft, so cost and quality are auditable
--
-- WHY A WATCH LIST AND NOT "ALL SITES"
-- Compass alone covers stadiums, offices and universities, and most of them
-- never have a dated event worth chasing content for. A curated list keeps the
-- weekly question precise, keeps the AI prompt short and cheap, and means the
-- team decides what's worth watching rather than the data deciding for them.
--
-- NOTHING AI-DRAFTED IS TRUSTED
-- Every suggestion lands as status 'suggested' and counts towards nothing until
-- a person confirms it. A model will state a fixture date confidently and be
-- wrong, and the whole point of this is emailing a client about a specific day.
-- Confirming is a deliberate act, and source_note keeps whatever the model said
-- it relied on so the check is possible.

-- ============================================================
-- 1. The watch list
-- ============================================================
create table if not exists event_venues (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  -- Free text, not an enum: the list lives in lib/events.js like every other
  -- vocabulary in this app, so adding "conference centre" needs no migration.
  kind text,
  -- Town and country disambiguate for the model and for a human reading the
  -- week view — there is more than one "Victoria Park".
  town text,
  -- Anything the model should know: which competitions play here, whether it
  -- hosts concerts, a official fixtures page to prefer.
  search_hint text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table event_venues drop constraint if exists event_venues_name_len;
alter table event_venues add constraint event_venues_name_len
  check (length(name) between 1 and 120);

create unique index if not exists event_venues_client_name_key
  on event_venues (client_id, lower(name));
create index if not exists event_venues_active_idx on event_venues (active) where active;

alter table event_venues enable row level security;

-- The content team are ordinary internal users, not super admins, so they can
-- curate the list themselves. No client_viewer access: this is internal
-- planning, and it names which clients we watch.
drop policy if exists "Internal staff can read event venues" on event_venues;
create policy "Internal staff can read event venues"
  on event_venues for select using (public.is_internal_staff());

drop policy if exists "Internal staff can manage event venues" on event_venues;
create policy "Internal staff can manage event venues"
  on event_venues for all
  using (public.is_internal_staff())
  with check (public.is_internal_staff());

-- ============================================================
-- 2. The events
-- ============================================================
create table if not exists venue_events (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references event_venues(id) on delete cascade,
  event_date date not null,
  -- Race meetings and festivals run for several days; one row with an end date
  -- reads better on a week view than five near-identical rows.
  end_date date,
  title text not null,
  event_type text,
  -- suggested → confirmed happens by hand. dismissed keeps a rejected draft on
  -- record so the same wrong fixture isn't re-suggested and re-read each week.
  status text not null default 'suggested',
  content_status text not null default 'not_asked',
  source text not null default 'manual',
  -- Where the model said it got this. The reason a human can check it.
  source_note text,
  notes text,
  created_by uuid references profiles(id),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table venue_events drop constraint if exists venue_events_status_known;
alter table venue_events add constraint venue_events_status_known
  check (status in ('suggested', 'confirmed', 'dismissed'));

alter table venue_events drop constraint if exists venue_events_content_status_known;
alter table venue_events add constraint venue_events_content_status_known
  check (content_status in ('not_asked', 'asked', 'received', 'ready'));

alter table venue_events drop constraint if exists venue_events_source_known;
alter table venue_events add constraint venue_events_source_known
  check (source in ('manual', 'ai'));

alter table venue_events drop constraint if exists venue_events_dates_ordered;
alter table venue_events add constraint venue_events_dates_ordered
  check (end_date is null or end_date >= event_date);

-- Stops a re-run proposing the same fixture again. Case-insensitive because a
-- model will not phrase a title identically twice.
create unique index if not exists venue_events_dedupe_key
  on venue_events (venue_id, event_date, lower(title));
create index if not exists venue_events_date_idx on venue_events (event_date);
create index if not exists venue_events_status_idx on venue_events (status);

alter table venue_events enable row level security;

drop policy if exists "Internal staff can read venue events" on venue_events;
create policy "Internal staff can read venue events"
  on venue_events for select using (public.is_internal_staff());

drop policy if exists "Internal staff can manage venue events" on venue_events;
create policy "Internal staff can manage venue events"
  on venue_events for all
  using (public.is_internal_staff())
  with check (public.is_internal_staff());

-- ============================================================
-- 3. The AI run log
-- ============================================================
-- Every draft run costs money and may be wrong, so each one leaves a record:
-- what was asked, what came back, what was already known, and what it cost.
create table if not exists event_ai_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  ran_by uuid references profiles(id),
  from_date date not null,
  to_date date not null,
  venue_count integer not null default 0,
  returned_count integer not null default 0,
  inserted_count integer not null default 0,
  skipped_count integer not null default 0,
  model text,
  input_tokens integer,
  output_tokens integer,
  ok boolean not null default true,
  error text
);

alter table event_ai_runs enable row level security;

drop policy if exists "Internal staff can read ai runs" on event_ai_runs;
create policy "Internal staff can read ai runs"
  on event_ai_runs for select using (public.is_internal_staff());

drop policy if exists "Internal staff can write ai runs" on event_ai_runs;
create policy "Internal staff can write ai runs"
  on event_ai_runs for insert with check (public.is_internal_staff());
