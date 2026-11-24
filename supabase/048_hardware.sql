-- Run this once in Supabase → SQL Editor, after 047.
--
-- Hardware: the screens and mounts the survey forms offer, managed from
-- Admin → Hardware instead of being written into the code (lib/screenSizes.js,
-- which stays as the fallback until this has run).
--
-- KEYS NEVER CHANGE
-- A survey stores the key ('55', '37_stretch', 'Tilt Bracket'), not the label,
-- and the cost-sheet catalogue matches on it ('screen:55'). So the label, model
-- and dimensions can be edited freely, but the key is fixed when the item is
-- created. The seed below uses the exact keys already in use, so every existing
-- survey, report and cost sheet resolves exactly as before.
--
-- RETIRE, DON'T DELETE
-- Old surveys still point at old hardware. Switching an item off (active =
-- false) takes it out of the dropdowns but keeps it resolvable everywhere else.
-- There is deliberately no delete policy.
--
-- 'Other' (free-text mount) stays built into the form rather than a row here,
-- because it's a behaviour (show a text box), not a product.

create table if not exists hardware_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('screen', 'mount')),
  key text not null check (length(key) between 1 and 80),
  label text not null check (length(trim(label)) between 1 and 80),
  model text check (model is null or length(model) <= 80),
  width_mm integer check (width_mm is null or (width_mm > 0 and width_mm <= 20000)),
  height_mm integer check (height_mm is null or (height_mm > 0 and height_mm <= 20000)),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists hardware_items_kind_key on hardware_items (kind, key);

alter table hardware_items enable row level security;

-- Everyone reads it, signed in or not: the engineer survey form and the client
-- self-survey are public pages, and nothing here is sensitive.
drop policy if exists "Anyone can read hardware" on hardware_items;
create policy "Anyone can read hardware"
  on hardware_items for select
  using (true);

drop policy if exists "Super admins can add hardware" on hardware_items;
create policy "Super admins can add hardware"
  on hardware_items for insert
  with check (public.is_super_admin());

drop policy if exists "Super admins can edit hardware" on hardware_items;
create policy "Super admins can edit hardware"
  on hardware_items for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select on hardware_items to anon, authenticated;
grant insert, update on hardware_items to authenticated;

-- The key can't be changed once set (see top of file).
create or replace function public.hardware_items_lock_key()
returns trigger
language plpgsql
as $$
begin
  if new.key is distinct from old.key or new.kind is distinct from old.kind then
    raise exception 'A hardware item''s key and kind can''t be changed — retire it and add a new one instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists hardware_items_lock_key on hardware_items;
create trigger hardware_items_lock_key
  before update on hardware_items
  for each row execute function public.hardware_items_lock_key();

-- ============================================================
-- Seed: exactly what lib/screenSizes.js holds today.
-- ============================================================
insert into hardware_items (kind, key, label, model, width_mm, height_mm, position) values
  ('screen', '13',          '13"',                'QB13R',           322,  194,  10),
  ('screen', '32',          '32"',                'QM32C',           727,  422,  20),
  ('screen', '37_stretch',  '37" Stretch Screen', 'SH37C',           923,  253,  30),
  ('screen', '43',          '43"',                'QM43C',           970,  558,  40),
  ('screen', '50',          '50"',                'QM50C',           1124, 645,  50),
  ('screen', '55',          '55"',                'QM55C',           1238, 709,  60),
  ('screen', '65',          '65"',                'QM65C',           1457, 832,  70),
  ('screen', '75',          '75"',                'Confirm on site', null, null, 80),
  ('screen', 'other',       'Custom LED Wall',    'Custom',          null, null, 1000),
  ('mount',  'Tilt Bracket',       'Tilt Bracket',       null, null, null, 10),
  ('mount',  'Slim Profile Mount', 'Slim Profile Mount', null, null, null, 20),
  ('mount',  'Ceiling Mount',      'Ceiling Mount',      null, null, null, 30),
  ('mount',  'Swing Arm',          'Swing Arm',          null, null, null, 40)
on conflict (kind, key) do nothing;
