-- Run this once in Supabase → SQL Editor, after 035.
--
-- Cost sheets: a quote built from a survey, priced by the PM, then sent to the
-- client for approval the same way a survey is.
--
-- THREE TABLES
--   price_items        the catalogue — what we sell, with default cost/price
--   price_client_rates per-client overrides of those defaults
--   cost_sheets        one quote, its lines, and its approval state
--
-- WHY LINES ARE JSONB AND NOT A TABLE
-- Same reasoning as survey areas and visit issues: a sheet's lines are only
-- ever read and written with the sheet, never queried across sheets. A child
-- table would buy ordering and referential integrity we'd then have to
-- maintain, for no query we actually run. The trade-off is that reporting
-- across lines means parsing jsonb, which is why the two totals are stored.
--
-- WHY THE TOTALS ARE STORED
-- total_cost and total_price are written by the app whenever the lines change,
-- so a list of sheets can show money without fetching every line. They are
-- derived data, so they can drift — nothing but the app writes them, and the
-- editor recalculates on every save.
--
-- MARGIN NEVER LEAVES THE BUILDING
-- Every line carries unit_cost as well as unit_price, so the sheet shows margin
-- internally. The client-facing function at the bottom strips cost out of the
-- lines in SQL before returning them. That is deliberate: the survey approval
-- endpoint used to send the engineer's name to anyone holding a link purely
-- because the page didn't happen to display it. Hiding a field in the page is
-- not hiding it.

-- ============================================================
-- 1. The catalogue
-- ============================================================
create table if not exists price_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- 'each', 'day', 'metre' — shown on the sheet next to the quantity.
  unit text not null default 'each',
  default_cost numeric(12,2),
  default_price numeric(12,2),
  -- Ties a catalogue row to something a survey already knows, so a sheet can
  -- be seeded from one: 'screen:55', 'mount:Tilt Bracket', 'engineer_day'.
  -- Null for items that have no survey equivalent, like a router.
  match_key text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table price_items drop constraint if exists price_items_money_sane;
alter table price_items add constraint price_items_money_sane check (
  (default_cost is null or (default_cost >= 0 and default_cost <= 1000000))
  and (default_price is null or (default_price >= 0 and default_price <= 1000000))
);

-- Not a partial index, deliberately. ON CONFLICT can only infer a partial
-- unique index if the statement repeats the index's WHERE clause, and the seed
-- at the bottom of this file uses "on conflict (match_key)". A plain unique
-- index behaves identically here: Postgres treats NULLs as distinct, so any
-- number of catalogue items can have no match_key while the keyed ones stay
-- unique.
--
-- Dropped by name first so re-running this file replaces the partial version
-- if an earlier attempt created it.
drop index if exists price_items_match_key_key;
create unique index if not exists price_items_match_key_key
  on price_items (match_key);

alter table price_items enable row level security;

-- Read by anyone internal (a PM has to build a sheet); changed only by a super
-- admin, because a price list everyone can edit is a price list nobody owns.
drop policy if exists "Internal staff can read price items" on price_items;
create policy "Internal staff can read price items"
  on price_items for select
  using (public.is_internal_staff());

drop policy if exists "Super admins can manage price items" on price_items;
create policy "Super admins can manage price items"
  on price_items for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============================================================
-- 2. Per-client rates
-- ============================================================
-- Either column may be null, meaning "use the catalogue default for this one" —
-- so a client can have a different sell price without restating our cost.
create table if not exists price_client_rates (
  id uuid primary key default gen_random_uuid(),
  price_item_id uuid not null references price_items(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  cost numeric(12,2),
  price numeric(12,2),
  created_at timestamptz not null default now()
);

alter table price_client_rates drop constraint if exists price_client_rates_money_sane;
alter table price_client_rates add constraint price_client_rates_money_sane check (
  (cost is null or (cost >= 0 and cost <= 1000000))
  and (price is null or (price >= 0 and price <= 1000000))
);

create unique index if not exists price_client_rates_item_client_key
  on price_client_rates (price_item_id, client_id);

alter table price_client_rates enable row level security;

drop policy if exists "Internal staff can read client rates" on price_client_rates;
create policy "Internal staff can read client rates"
  on price_client_rates for select
  using (public.is_internal_staff());

drop policy if exists "Super admins can manage client rates" on price_client_rates;
create policy "Super admins can manage client rates"
  on price_client_rates for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============================================================
-- 3. The sheets
-- ============================================================
-- client_id is denormalised from the survey on purpose: RLS has to decide
-- access without a join, exactly as it does for surveys and installs.
create table if not exists cost_sheets (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  client_id uuid not null references clients(id),
  reference text,
  title text,
  items jsonb not null default '[]',
  -- Shown to the client under the totals; internal_notes never is.
  terms text,
  internal_notes text,
  total_cost numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0,
  approval_token uuid not null default gen_random_uuid(),
  approval_status text not null default 'not_sent',
  approval_name text,
  approval_comment text,
  approval_decided_at timestamptz,
  approval_sent_at timestamptz,
  archived_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create unique index if not exists cost_sheets_approval_token_key on cost_sheets (approval_token);
create index if not exists cost_sheets_survey_id_idx on cost_sheets (survey_id);
create index if not exists cost_sheets_client_id_idx on cost_sheets (client_id);
create index if not exists cost_sheets_archived_at_idx on cost_sheets (archived_at);

alter table cost_sheets enable row level security;

-- No client_viewer access at any point: a cost sheet carries our cost and our
-- margin. The only way a client ever sees one is the token page below, which
-- returns lines with cost stripped out.
drop policy if exists "Internal staff can read cost sheets" on cost_sheets;
create policy "Internal staff can read cost sheets"
  on cost_sheets for select
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

drop policy if exists "Internal staff can create cost sheets" on cost_sheets;
create policy "Internal staff can create cost sheets"
  on cost_sheets for insert
  with check (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

drop policy if exists "Internal staff can update cost sheets" on cost_sheets;
create policy "Internal staff can update cost sheets"
  on cost_sheets for update
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)))
  with check (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

drop policy if exists "Internal staff can delete cost sheets" on cost_sheets;
create policy "Internal staff can delete cost sheets"
  on cost_sheets for delete
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

-- ============================================================
-- 4. Seed the catalogue
-- ============================================================
-- Items only, never prices. The match_keys line up with lib/screenSizes.js so a
-- sheet seeded from a survey finds them; a price of null shows as "needs a
-- price" in the editor rather than as free.
insert into price_items (name, unit, match_key) values
  ('Samsung QB13R 13" screen',        'each', 'screen:13'),
  ('Samsung QM32C 32" screen',        'each', 'screen:32'),
  ('Samsung SH37C 37" stretch screen','each', 'screen:37_stretch'),
  ('Samsung QM43C 43" screen',        'each', 'screen:43'),
  ('Samsung QM50C 50" screen',        'each', 'screen:50'),
  ('Samsung QM55C 55" screen',        'each', 'screen:55'),
  ('Samsung QM65C 65" screen',        'each', 'screen:65'),
  ('75" screen',                      'each', 'screen:75'),
  ('Custom LED wall',                 'each', 'screen:other'),
  ('Tilt bracket',                    'each', 'mount:Tilt Bracket'),
  ('Slim profile mount',              'each', 'mount:Slim Profile Mount'),
  ('Ceiling mount',                   'each', 'mount:Ceiling Mount'),
  ('Swing arm mount',                 'each', 'mount:Swing Arm'),
  ('Engineer day',                    'day',  'engineer_day')
on conflict (match_key) do nothing;

-- ============================================================
-- 5. What the client is allowed to see
-- ============================================================
-- Mirrors get_survey_for_approval: nothing for an unknown token, an archived
-- sheet, or one never sent — so a link is revoked by archiving or withdrawing.
--
-- The lines are rebuilt here with unit_cost and line_cost removed. Adding a new
-- cost-bearing field to a line means adding it to this subtraction too.
create or replace function public.get_cost_sheet_for_approval(p_token uuid)
returns table (
  id uuid,
  reference text,
  title text,
  site_location text,
  client_name text,
  survey_date date,
  items jsonb,
  total_price numeric,
  terms text,
  approval_status text,
  approval_name text,
  approval_comment text,
  approval_decided_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    cs.id,
    cs.reference,
    cs.title,
    s.site_location,
    c.name,
    s.survey_date,
    coalesce((
      select jsonb_agg(e - 'unit_cost' - 'line_cost' order by ord)
      from jsonb_array_elements(cs.items) with ordinality as t(e, ord)
    ), '[]'::jsonb),
    cs.total_price,
    cs.terms,
    cs.approval_status,
    cs.approval_name,
    cs.approval_comment,
    cs.approval_decided_at
  from cost_sheets cs
  join surveys s on s.id = cs.survey_id
  left join clients c on c.id = cs.client_id
  where cs.approval_token = p_token
    and cs.archived_at is null
    and cs.approval_status <> 'not_sent'
  limit 1;
$$;

grant execute on function public.get_cost_sheet_for_approval(uuid) to anon, authenticated;

-- ============================================================
-- 6. Recording a decision
-- ============================================================
-- Deliberately narrow, like the survey version: holding a token can set the
-- approval columns and nothing else — not the lines, not the totals.
create or replace function public.submit_cost_sheet_approval(
  p_token uuid,
  p_decision text,
  p_name text,
  p_comment text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hit integer;
begin
  if p_decision not in ('approved', 'changes_requested') then
    return false;
  end if;

  update cost_sheets
  set approval_status = p_decision,
      approval_name = nullif(btrim(coalesce(p_name, '')), ''),
      approval_comment = nullif(btrim(coalesce(p_comment, '')), ''),
      approval_decided_at = now()
  where approval_token = p_token
    and archived_at is null
    -- A sheet that was never sent can't be decided; one already decided can be
    -- changed, because a client who asked for changes may later approve.
    and approval_status <> 'not_sent';

  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

grant execute on function public.submit_cost_sheet_approval(uuid, text, text, text) to anon, authenticated;
