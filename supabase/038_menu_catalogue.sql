-- Run this once in Supabase → SQL Editor, after 037.
--
-- Onboarding a second venue for a client we already hold one for.
--
-- 037 gives every venue its own product list, which is right for prices and
-- ranges but wrong for the fifteenth stadium the same caterer runs: the same
-- Madri, the same pies, retyped every time. Two things fix that.
--
--   menu_catalogue_products  a product library per CLIENT. A venue takes a
--                            copy of a catalogue line, keeping its own price
--                            and its own ticks, and remembers where it came
--                            from (menu_products.catalogue_id).
--   menu_copy_venue()        start a venue as a copy of an existing one —
--                            sections and products always, outlets and their
--                            ranges when the sites are laid out alike.
--
-- WHY A COPY AND NOT A REFERENCE
-- A venue's product is still its own row. Prices differ by venue, one site
-- drops a line the others keep, and a range tick has to point at something
-- venue-specific. catalogue_id records the parentage so a catalogue change
-- can be offered to the venues later; it does not push anything automatically.

-- ============================================================
-- 1. The client's product catalogue
-- ============================================================
create table if not exists menu_catalogue_products (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  -- The catalogue is flat: a section is a label here, not a row, because a
  -- venue's section order is the venue's own business.
  section_name text not null,
  name text not null,
  detail text,
  -- The list price. A venue may charge something else; this is what a new
  -- venue starts with.
  price text,
  tier_note text,
  notes text,
  position int not null default 0,
  archived_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists menu_catalogue_products_client_id_idx on menu_catalogue_products (client_id);

-- Same identity rule as a venue product: section + name + detail line.
create unique index if not exists menu_catalogue_products_identity_idx
  on menu_catalogue_products (client_id, lower(trim(section_name)), lower(trim(name)), lower(trim(coalesce(detail, ''))));

alter table menu_catalogue_products enable row level security;

drop policy if exists "Internal staff can read menu catalogue" on menu_catalogue_products;
create policy "Internal staff can read menu catalogue"
  on menu_catalogue_products for select
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

drop policy if exists "Internal staff can manage menu catalogue" on menu_catalogue_products;
create policy "Internal staff can manage menu catalogue"
  on menu_catalogue_products for all
  using (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)))
  with check (public.is_super_admin() or (public.is_internal_staff() and public.has_client_access(client_id)));

-- Where a venue product came from. Null means it was typed or imported
-- straight into the venue. Set null on delete: losing the catalogue line must
-- not take the venue's product, its price or its ticks with it.
alter table menu_products
  add column if not exists catalogue_id uuid references menu_catalogue_products(id) on delete set null;

create index if not exists menu_products_catalogue_id_idx on menu_products (catalogue_id);

-- ============================================================
-- 2. Catalogue → venue
-- ============================================================
-- Security invoker throughout, like 037's bulk helpers: RLS still decides
-- what the caller can touch. These exist to make a multi-row change atomic.

-- Copy catalogue lines into a venue as venue products, creating any section
-- the venue doesn't have yet. Lines the venue already holds — by catalogue_id
-- or by section + name + detail — are skipped, so running it twice is safe.
create or replace function public.menu_catalogue_add_to_venue(p_venue_id uuid, p_catalogue_ids uuid[])
returns int
language plpgsql security invoker
set search_path = public
as $$
declare
  v_client uuid;
  v_added int;
begin
  select client_id into v_client from menu_venues where id = p_venue_id;
  if v_client is null then
    raise exception 'Venue not found';
  end if;

  if exists (
    select 1 from menu_catalogue_products c
    where c.id = any(p_catalogue_ids) and c.client_id <> v_client
  ) then
    raise exception 'Those catalogue products belong to a different client';
  end if;

  -- Sections first: a catalogue line names its section, the venue holds rows.
  insert into menu_sections (venue_id, name, position)
  select p_venue_id, x.section_name,
         coalesce((select max(position) from menu_sections where venue_id = p_venue_id), -1)
           + row_number() over (order by x.section_name)
  from (
    select distinct trim(c.section_name) as section_name
    from menu_catalogue_products c
    where c.id = any(p_catalogue_ids)
      and not exists (
        select 1 from menu_sections s
        where s.venue_id = p_venue_id and lower(trim(s.name)) = lower(trim(c.section_name))
      )
  ) x;

  with incoming as (
    select c.*, s.id as section_id
    from menu_catalogue_products c
    join menu_sections s
      on s.venue_id = p_venue_id and lower(trim(s.name)) = lower(trim(c.section_name))
    where c.id = any(p_catalogue_ids)
      and c.archived_at is null
      and not exists (
        select 1 from menu_products p
        where p.venue_id = p_venue_id
          and (
            p.catalogue_id = c.id
            or (
              p.section_id = s.id
              and lower(trim(p.name)) = lower(trim(c.name))
              and lower(trim(coalesce(p.detail, ''))) = lower(trim(coalesce(c.detail, '')))
            )
          )
      )
  ), inserted as (
    insert into menu_products (venue_id, section_id, name, detail, price, tier_note, catalogue_id, position)
    select p_venue_id, i.section_id, i.name, i.detail, i.price, i.tier_note, i.id,
           coalesce((select max(position) from menu_products where venue_id = p_venue_id), -1)
             + row_number() over (order by i.position, i.name)
    from incoming i
    returning 1
  )
  select count(*) into v_added from inserted;

  return coalesce(v_added, 0);
end;
$$;

-- The other direction: put a venue's products into its client's catalogue, so
-- the first venue set up by hand seeds the library for the next one. Products
-- already in the catalogue are linked rather than duplicated.
create or replace function public.menu_catalogue_capture_venue(p_venue_id uuid)
returns int
language plpgsql security invoker
set search_path = public
as $$
declare
  v_client uuid;
  v_added int;
begin
  select client_id into v_client from menu_venues where id = p_venue_id;
  if v_client is null then
    raise exception 'Venue not found';
  end if;

  with incoming as (
    select p.id, s.name as section_name, p.name, p.detail, p.price, p.tier_note, p.position
    from menu_products p
    join menu_sections s on s.id = p.section_id
    where p.venue_id = p_venue_id
      and p.archived_at is null
      and p.catalogue_id is null
      and not exists (
        select 1 from menu_catalogue_products c
        where c.client_id = v_client
          and lower(trim(c.section_name)) = lower(trim(s.name))
          and lower(trim(c.name)) = lower(trim(p.name))
          and lower(trim(coalesce(c.detail, ''))) = lower(trim(coalesce(p.detail, '')))
      )
  ), inserted as (
    insert into menu_catalogue_products (client_id, section_name, name, detail, price, tier_note, position, created_by)
    select v_client, i.section_name, i.name, i.detail, i.price, i.tier_note,
           coalesce((select max(position) from menu_catalogue_products where client_id = v_client), -1)
             + row_number() over (order by i.position, i.name),
           auth.uid()
    from incoming i
    returning 1
  )
  select count(*) into v_added from inserted;

  -- Link everything that matches, whether this call added it or an earlier one did.
  update menu_products p
  set catalogue_id = c.id
  from menu_catalogue_products c, menu_sections s
  where p.venue_id = p_venue_id
    and p.catalogue_id is null
    and s.id = p.section_id
    and c.client_id = v_client
    and lower(trim(c.section_name)) = lower(trim(s.name))
    and lower(trim(c.name)) = lower(trim(p.name))
    and lower(trim(coalesce(c.detail, ''))) = lower(trim(coalesce(p.detail, '')));

  return coalesce(v_added, 0);
end;
$$;

-- ============================================================
-- 3. Venue → new venue
-- ============================================================
-- Sections and products always come across; they are what a sister site
-- shares. Outlets are optional because a second stadium is laid out
-- differently — and ranges can only come with them, since a tick is an outlet
-- and a product together. Store codes and schedules are deliberately NOT
-- copied: they belong to the site the copy came from.
create or replace function public.menu_copy_venue(
  p_from_venue uuid,
  p_name text,
  p_copy_outlets boolean default false,
  p_copy_ranges boolean default false
)
returns uuid
language plpgsql security invoker
set search_path = public
as $$
declare
  v_client uuid;
  v_new uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'The new venue needs a name';
  end if;

  select client_id into v_client from menu_venues where id = p_from_venue;
  if v_client is null then
    raise exception 'Venue not found';
  end if;

  insert into menu_venues (client_id, name, created_by)
  values (v_client, trim(p_name), auth.uid())
  returning id into v_new;

  insert into menu_sections (venue_id, name, position)
  select v_new, name, position from menu_sections where venue_id = p_from_venue;

  insert into menu_products (venue_id, section_id, name, detail, price, tier_note, catalogue_id, position)
  select v_new, ns.id, p.name, p.detail, p.price, p.tier_note, p.catalogue_id, p.position
  from menu_products p
  join menu_sections os on os.id = p.section_id
  join menu_sections ns on ns.venue_id = v_new and lower(trim(ns.name)) = lower(trim(os.name))
  where p.venue_id = p_from_venue and p.archived_at is null;

  insert into menu_sets (venue_id, name, position)
  select v_new, name, position from menu_sets where venue_id = p_from_venue;

  if p_copy_outlets then
    insert into menu_outlets (venue_id, name, menu_tier, menu_type, landscape_screens, portrait_screens, client_screens, position)
    select v_new, name, menu_tier, menu_type, landscape_screens, portrait_screens, client_screens, position
    from menu_outlets where venue_id = p_from_venue and archived_at is null;

    if p_copy_ranges then
      insert into menu_ranges (menu_set_id, outlet_id, product_id, venue_id)
      select nset.id, nout.id, nprod.id, v_new
      from menu_ranges r
      join menu_sets oset on oset.id = r.menu_set_id
      join menu_sets nset on nset.venue_id = v_new and nset.name = oset.name
      join menu_outlets oout on oout.id = r.outlet_id
      join menu_outlets nout on nout.venue_id = v_new and nout.name = oout.name
      join menu_products oprod on oprod.id = r.product_id
      join menu_sections oprodsec on oprodsec.id = oprod.section_id
      join menu_sections nprodsec on nprodsec.venue_id = v_new and lower(trim(nprodsec.name)) = lower(trim(oprodsec.name))
      join menu_products nprod
        on nprod.venue_id = v_new
       and nprod.section_id = nprodsec.id
       and lower(trim(nprod.name)) = lower(trim(oprod.name))
       and lower(trim(coalesce(nprod.detail, ''))) = lower(trim(coalesce(oprod.detail, '')))
      where r.venue_id = p_from_venue;
    end if;
  end if;

  return v_new;
end;
$$;
