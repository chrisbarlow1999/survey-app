-- Run this once in Supabase → SQL Editor, after 036.
--
-- Menus: what every outlet at a venue sells, per menu set, so schedules can be
-- worked out from the ranges instead of compared by eye across spreadsheets.
--
-- SIX TABLES
--   menu_venues    one stadium (or any multi-outlet site) for one client
--   menu_sections  the slide titles products are grouped under — DRAUGHT BEER,
--                  SOFT DRINKS, HOT FOOD — in display order
--   menu_products  the venue's single product list
--   menu_outlets   the kiosks, with their MyScreens store code and screens
--   menu_sets      named menus that run on different days: Premier League, UEFA
--   menu_ranges    one row per ticked box: this outlet sells this product
--                  under this menu set. No row means not sold.
--
-- WHY RANGES ARE ROWS AND NOT JSONB
-- Unlike survey areas or cost sheet lines, ranges are queried across the
-- record: "which outlets sell Bovril", "what differs between these two sets".
-- A tick is also the unit that changes — toggling one box shouldn't rewrite a
-- whole outlet.
--
-- WHY PRICE IS TEXT
-- The client's sheet carries prices like "6.60 | 3.30" (pint | half). Nothing
-- here does arithmetic on a price, and splitting that into columns now would
-- be guessing at a structure the client hasn't settled. One price per product
-- per venue: the client confirmed prices don't vary by outlet. Meal deals that
-- differ by menu tier are separate products, as they are on the sheet.
--
-- ACCESS
-- Internal staff with access to the venue's client, the same rule as cost
-- sheets. client_viewer accounts get nothing yet: the client's edit path is a
-- change request with an approval step, which is a later migration, and a
-- read-only view isn't worth granting on its own.

-- ============================================================
-- 1. Venues
-- ============================================================
create table if not exists menu_venues (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  name text not null,
  notes text,
  archived_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists menu_venues_client_id_idx on menu_venues (client_id);

alter table menu_venues enable row level security;

drop policy if exists "Internal staff can read menu venues" on menu_venues;
create policy "Internal staff can read menu venues"
  on menu_venues for select
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

drop policy if exists "Internal staff can manage menu venues" on menu_venues;
create policy "Internal staff can manage menu venues"
  on menu_venues for all
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)))
  with check (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

-- Every child table decides access through its venue. Security definer so the
-- lookup isn't itself filtered by RLS, which would recurse; it still checks
-- the caller's own rights, so it grants nothing the venue policy wouldn't.
create or replace function public.can_manage_menu_venue(check_venue_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from menu_venues v
    where v.id = check_venue_id
      and (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(v.client_id)))
  );
$$;

-- ============================================================
-- 2. Sections, products, outlets, sets
-- ============================================================
create table if not exists menu_sections (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references menu_venues(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists menu_sections_venue_id_idx on menu_sections (venue_id);

create table if not exists menu_products (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references menu_venues(id) on delete cascade,
  section_id uuid not null references menu_sections(id) on delete cascade,
  name text not null,
  -- The line under the name on the sheet: ABV, size, description, flavours.
  -- Part of a product's identity — "Coke Zero, 500ml" and "Coke Zero, 500ml
  -- Draught" are both on the Man United sheet and are different products.
  detail text,
  price text,
  -- Free-text qualifier the sheet puts beside some rows, e.g. "Menu 4" on a
  -- meal deal that only applies to Menu 4 outlets.
  tier_note text,
  position int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists menu_products_venue_id_idx on menu_products (venue_id);
create index if not exists menu_products_section_id_idx on menu_products (section_id);

create table if not exists menu_outlets (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references menu_venues(id) on delete cascade,
  -- As the outlet is named in MyScreens, e.g. "NK03".
  name text not null,
  -- MyScreens store code, e.g. "44817 (10)".
  store_code text,
  -- The client's classification: "Menu 3", "No Food", "Sweet Shop (Bespoke)".
  menu_tier text,
  -- "DRAUGHT BEVERAGE MENU", "PACKAGED (-HOT DRINKS) BEVERAGE MENU", "BRISK".
  menu_type text,
  -- Null means not known, zero means none. Kept as two numbers because a
  -- schedule plays to a fixed set of screens: a 4-landscape outlet can't
  -- share one with a 4-landscape-plus-1-portrait outlet.
  landscape_screens int check (landscape_screens is null or landscape_screens between 0 and 50),
  portrait_screens int check (portrait_screens is null or portrait_screens between 0 and 50),
  -- The screen count as the client's sheet gives it ("4", "1 (Portrait
  -- Screen)", "N/A"). Kept beside the numbers above because the two sources
  -- disagree often enough that the disagreement is worth seeing.
  client_screens text,
  -- The schedule this outlet is on today, as the master schedule names it.
  -- Plain text for now: it's only compared against, not planned with.
  current_schedule text,
  notes text,
  position int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists menu_outlets_venue_id_idx on menu_outlets (venue_id);

create table if not exists menu_sets (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references menu_venues(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists menu_sets_venue_id_idx on menu_sets (venue_id);

-- ============================================================
-- 3. Ranges
-- ============================================================
-- venue_id is denormalised so RLS can decide access without joining through
-- the set, and so a whole venue's ticks load in one filtered query.
create table if not exists menu_ranges (
  menu_set_id uuid not null references menu_sets(id) on delete cascade,
  outlet_id uuid not null references menu_outlets(id) on delete cascade,
  product_id uuid not null references menu_products(id) on delete cascade,
  venue_id uuid not null references menu_venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (menu_set_id, outlet_id, product_id)
);

create index if not exists menu_ranges_venue_id_idx on menu_ranges (venue_id);

-- ============================================================
-- 4. RLS for the child tables
-- ============================================================
-- Written out per table rather than inside the loop below, so Supabase's SQL
-- editor can see RLS is on; it can't read the dynamic SQL and warns otherwise.
alter table menu_sections enable row level security;
alter table menu_products enable row level security;
alter table menu_outlets enable row level security;
alter table menu_sets enable row level security;
alter table menu_ranges enable row level security;

do $$
declare t text;
begin
  foreach t in array array['menu_sections', 'menu_products', 'menu_outlets', 'menu_sets', 'menu_ranges'] loop
    execute format('drop policy if exists "Venue staff can read %s" on %I', t, t);
    execute format('create policy "Venue staff can read %s" on %I for select using (public.can_manage_menu_venue(venue_id))', t, t);
    execute format('drop policy if exists "Venue staff can manage %s" on %I', t, t);
    execute format('create policy "Venue staff can manage %s" on %I for all using (public.can_manage_menu_venue(venue_id)) with check (public.can_manage_menu_venue(venue_id))', t, t);
  end loop;
end $$;

-- ============================================================
-- 5. Bulk operations
-- ============================================================
-- All three are security invoker: they run as the caller, so RLS above still
-- decides what they can touch. They exist to make multi-row changes atomic —
-- an import that fails halfway must not leave a set half-ticked.

-- Replace every tick in one set with the given pairs:
-- [{"outlet_id": "...", "product_id": "..."}, ...]
create or replace function public.menu_replace_ranges(p_set_id uuid, p_pairs jsonb)
returns int
language plpgsql security invoker
set search_path = public
as $$
declare
  v_venue uuid;
  v_count int;
begin
  select venue_id into v_venue from menu_sets where id = p_set_id;
  if v_venue is null then
    raise exception 'Menu set not found';
  end if;

  delete from menu_ranges where menu_set_id = p_set_id;

  insert into menu_ranges (menu_set_id, outlet_id, product_id, venue_id)
  select p_set_id, (x->>'outlet_id')::uuid, (x->>'product_id')::uuid, v_venue
  from jsonb_array_elements(coalesce(p_pairs, '[]'::jsonb)) x
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Copy every tick from one set into another (which is emptied first). Both
-- sets must belong to the same venue.
create or replace function public.menu_copy_set(p_from_set uuid, p_to_set uuid)
returns int
language plpgsql security invoker
set search_path = public
as $$
declare
  v_from_venue uuid;
  v_to_venue uuid;
  v_count int;
begin
  select venue_id into v_from_venue from menu_sets where id = p_from_set;
  select venue_id into v_to_venue from menu_sets where id = p_to_set;
  if v_from_venue is null or v_to_venue is null or v_from_venue <> v_to_venue then
    raise exception 'Both menu sets must exist and belong to the same venue';
  end if;

  delete from menu_ranges where menu_set_id = p_to_set;

  insert into menu_ranges (menu_set_id, outlet_id, product_id, venue_id)
  select p_to_set, outlet_id, product_id, venue_id
  from menu_ranges where menu_set_id = p_from_set;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Make one outlet's range in a set identical to another outlet's.
create or replace function public.menu_copy_outlet_range(p_set_id uuid, p_from_outlet uuid, p_to_outlet uuid)
returns int
language plpgsql security invoker
set search_path = public
as $$
declare
  v_venue uuid;
  v_count int;
begin
  select venue_id into v_venue from menu_sets where id = p_set_id;
  if v_venue is null then
    raise exception 'Menu set not found';
  end if;
  if not exists (select 1 from menu_outlets where id = p_from_outlet and venue_id = v_venue)
     or not exists (select 1 from menu_outlets where id = p_to_outlet and venue_id = v_venue) then
    raise exception 'Both outlets must belong to the set''s venue';
  end if;

  delete from menu_ranges where menu_set_id = p_set_id and outlet_id = p_to_outlet;

  insert into menu_ranges (menu_set_id, outlet_id, product_id, venue_id)
  select p_set_id, p_to_outlet, product_id, venue_id
  from menu_ranges where menu_set_id = p_set_id and outlet_id = p_from_outlet;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
