-- Run this once in Supabase → SQL Editor, after 039.
--
-- Menu change requests: the ask, kept apart from the menu itself.
--
-- Today a change arrives as a highlighted spreadsheet and someone works out by
-- hand which outlets share a tariff with the one that changed. A request here
-- records what was asked for, at which outlets, for which fixture — and the
-- screen that raises it does the sharing check while it's being typed.
--
-- WHY A REQUEST ISN'T JUST AN EDIT
-- Between the ask and the screens changing there is artwork to make and a
-- content load to schedule. The ranges must keep saying what the screens say
-- until that work lands, so a request holds its changes until someone applies
-- it. menu_apply_change_request() is that moment, and it stamps applied_at so
-- it can't quietly happen twice.
--
-- WHO CAN DO WHAT
-- Internal staff with access to the venue's client, as everywhere else in
-- Menus. Client accounts raising their own requests is the next step and needs
-- its own policies — deliberately not smuggled in here.

create table if not exists menu_change_requests (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references menu_venues(id) on delete cascade,
  -- The menu the change applies to: Premier League, UEFA, and so on. A UEFA
  -- request leaves the Premier League menu alone, which is the whole reason
  -- sets exist.
  menu_set_id uuid references menu_sets(id) on delete set null,
  title text not null,
  -- Who at the client asked. Free text until client accounts exist.
  requested_by text,
  fixture_date date,
  notes text,
  status text not null default 'received'
    check (status in ('received', 'in_design', 'ready', 'live', 'cancelled')),
  applied_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists menu_change_requests_venue_id_idx on menu_change_requests (venue_id);
create index if not exists menu_change_requests_status_idx on menu_change_requests (venue_id, status);

-- One line of the ask. Kinds:
--   price        this product's price becomes to_price, everywhere it's sold
--   add          these outlets start selling this product
--   remove       these outlets stop selling it
--   new_product  a product the venue doesn't have yet, at these outlets —
--                needs artwork, so it carries its own name and section
create table if not exists menu_change_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references menu_change_requests(id) on delete cascade,
  -- Denormalised so RLS decides access without joining through the request.
  venue_id uuid not null references menu_venues(id) on delete cascade,
  kind text not null check (kind in ('price', 'add', 'remove', 'new_product')),
  -- Null for new_product until it's been created, and if the product is later
  -- archived the line still reads as what was asked for.
  product_id uuid references menu_products(id) on delete set null,
  product_label text not null,
  section_name text,
  detail text,
  from_price text,
  to_price text,
  -- Which outlets this line covers. An array because it's read whole with the
  -- request and never queried across rows.
  outlet_ids uuid[] not null default '{}',
  -- What was decided about outlets that share a schedule with these: null when
  -- there was nothing to decide.
  schedule_note text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists menu_change_request_items_request_id_idx on menu_change_request_items (request_id);
create index if not exists menu_change_request_items_venue_id_idx on menu_change_request_items (venue_id);

alter table menu_change_requests enable row level security;
alter table menu_change_request_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['menu_change_requests', 'menu_change_request_items'] loop
    execute format('drop policy if exists "Venue staff can read %s" on %I', t, t);
    execute format('create policy "Venue staff can read %s" on %I for select using (public.can_manage_menu_venue(venue_id))', t, t);
    execute format('drop policy if exists "Venue staff can manage %s" on %I', t, t);
    execute format('create policy "Venue staff can manage %s" on %I for all using (public.can_manage_menu_venue(venue_id)) with check (public.can_manage_menu_venue(venue_id))', t, t);
  end loop;
end $$;

-- ============================================================
-- Applying a request to the menu
-- ============================================================
-- Security invoker, so RLS still decides what the caller can touch. Every line
-- is applied in one statement each, inside one call, so a request can't land
-- half-done. Prices are estate-wide, as they are everywhere else in Menus;
-- ticks are per outlet and per menu set.
create or replace function public.menu_apply_change_request(p_request_id uuid)
returns jsonb
language plpgsql security invoker
set search_path = public
as $$
declare
  v_req record;
  v_prices int := 0;
  v_added int := 0;
  v_removed int := 0;
  v_created int := 0;
  v_item record;
  v_section uuid;
  v_product uuid;
  v_n int;
begin
  select * into v_req from menu_change_requests where id = p_request_id;
  if v_req.id is null then
    raise exception 'Change request not found';
  end if;
  if v_req.applied_at is not null then
    raise exception 'That request was already applied on %', to_char(v_req.applied_at, 'DD Mon YYYY');
  end if;
  if v_req.menu_set_id is null then
    raise exception 'That request has no menu set, so there is nothing to tick';
  end if;

  for v_item in
    select * from menu_change_request_items where request_id = p_request_id order by position
  loop
    if v_item.kind = 'price' and v_item.product_id is not null then
      update menu_products set price = v_item.to_price where id = v_item.product_id;
      get diagnostics v_n = row_count;
      v_prices := v_prices + v_n;

    elsif v_item.kind = 'remove' and v_item.product_id is not null then
      delete from menu_ranges
      where menu_set_id = v_req.menu_set_id
        and product_id = v_item.product_id
        and outlet_id = any(v_item.outlet_ids);
      get diagnostics v_n = row_count;
      v_removed := v_removed + v_n;

    elsif v_item.kind in ('add', 'new_product') then
      v_product := v_item.product_id;

      -- A product asked for by name is created the first time the request is
      -- applied, under its section, which is created too if need be.
      if v_product is null and v_item.kind = 'new_product' then
        select id into v_section from menu_sections
        where venue_id = v_req.venue_id and lower(trim(name)) = lower(trim(coalesce(v_item.section_name, 'UNSORTED')));
        if v_section is null then
          insert into menu_sections (venue_id, name, position)
          values (v_req.venue_id, coalesce(v_item.section_name, 'UNSORTED'),
                  coalesce((select max(position) + 1 from menu_sections where venue_id = v_req.venue_id), 0))
          returning id into v_section;
        end if;

        select id into v_product from menu_products
        where venue_id = v_req.venue_id and section_id = v_section
          and lower(trim(name)) = lower(trim(v_item.product_label))
          and lower(trim(coalesce(detail, ''))) = lower(trim(coalesce(v_item.detail, '')));
        if v_product is null then
          insert into menu_products (venue_id, section_id, name, detail, price, position)
          values (v_req.venue_id, v_section, v_item.product_label, v_item.detail, v_item.to_price,
                  coalesce((select max(position) + 1 from menu_products where venue_id = v_req.venue_id), 0))
          returning id into v_product;
          v_created := v_created + 1;
        end if;
        update menu_change_request_items set product_id = v_product where id = v_item.id;
      end if;

      if v_product is not null then
        insert into menu_ranges (menu_set_id, outlet_id, product_id, venue_id)
        select v_req.menu_set_id, o, v_product, v_req.venue_id
        from unnest(v_item.outlet_ids) o
        on conflict do nothing;
        get diagnostics v_n = row_count;
        v_added := v_added + v_n;
      end if;
    end if;
  end loop;

  update menu_change_requests
  set applied_at = now(), status = 'live', updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('prices', v_prices, 'ticks_added', v_added, 'ticks_removed', v_removed, 'products_created', v_created);
end;
$$;
