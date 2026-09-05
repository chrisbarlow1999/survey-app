-- ============================================================
-- DEMO DATA — safe to run, safe to remove
-- ============================================================
-- Fills the app with a few months of believable history so you can see what it
-- looks like in use: paginated lists, a populated board, the home page panels
-- with something in them, and Site History with real groupings.
--
-- This is NOT a migration. It's re-runnable — it clears its own rows first —
-- and it never touches anything you created.
--
-- HOW IT STAYS SEPARABLE
-- Every row it inserts has an id beginning 'd0000000', which no real row will
-- ever have. That makes it invisible in the UI but trivial to target. To remove
-- all of it, run the TEARDOWN block at the top of this file on its own.
--
-- Photos: demo surveys reuse a photo path already in your storage bucket if one
-- exists, so screen markers actually show. If your bucket is empty they simply
-- have no photo — nothing breaks.
-- ============================================================

-- ============================================================
-- TEARDOWN — run just this block to remove all demo data
-- ============================================================
delete from project_activity where id::text like 'd0000000-%';
delete from project_notes    where id::text like 'd0000000-%';
delete from project_tasks    where id::text like 'd0000000-%';
-- Tasks the template trigger added to demo projects have their own ids, so
-- clear anything still pointing at a demo project before the projects go.
delete from project_tasks    where project_id::text like 'd0000000-%';
delete from project_activity where project_id::text like 'd0000000-%';
delete from project_notes    where project_id::text like 'd0000000-%';
update surveys       set project_id = null where project_id::text like 'd0000000-%';
update installations set project_id = null where project_id::text like 'd0000000-%';
update visits        set project_id = null where project_id::text like 'd0000000-%';
delete from projects     where id::text like 'd0000000-%';
delete from surveys      where id::text like 'd0000000-%';
delete from installations where id::text like 'd0000000-%';
delete from visits       where id::text like 'd0000000-%';

-- ============================================================
-- Helpers (dropped again at the end)
-- ============================================================
create or replace function demo_id(kind int, n int) returns uuid
language sql immutable as $$
  select ('d0000000-000' || kind::text || '-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

-- One screen area, shaped exactly like the survey form writes it.
create or replace function demo_area(
  p_name text, p_size text, p_mount text, p_orientation text,
  p_screens int, p_photo text, p_measure text, p_note text
) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'area_name', p_name,
    'photo_path', p_photo,
    'screen_overlays', case when p_photo is null then '[]'::jsonb else (
      select jsonb_agg(jsonb_build_object(
        'x', 22 + (i - 1) * 8, 'y', 28 + (i - 1) * 6, 'w', 30, 'h', 18))
      from generate_series(1, p_screens) i
    ) end,
    'screen_size', p_size,
    'custom_w', null,
    'custom_h', null,
    'orientation', p_orientation,
    'mount_type', p_mount,
    'mount_type_other', null,
    'measurements', p_measure,
    'screens', (
      select jsonb_agg(jsonb_build_object(
        'power', case when i = p_screens and p_screens > 1 then 'No' else 'Yes' end,
        'data_port', case when i % 3 = 0 then 'No' else 'Yes' end,
        'notes', case when i = 1 then p_note else '' end))
      from generate_series(1, p_screens) i
    ),
    'additional_photos', '[]'::jsonb
  );
$$;

-- ============================================================
-- Seed
-- ============================================================
do $$
declare
  compass uuid;  starbucks uuid;  tui uuid;
  owner_a uuid;  owner_b uuid;
  photo text;
  n int;
  s record;
begin
  select id into compass   from clients where name ilike 'compass%'   limit 1;
  select id into starbucks from clients where name ilike 'starbucks%' limit 1;
  select id into tui       from clients where name ilike 'tui%'       limit 1;

  -- Fall back to whatever clients exist, so this still works if yours are named
  -- differently.
  if compass is null then select id into compass from clients order by name limit 1; end if;
  if starbucks is null then starbucks := compass; end if;
  if tui is null then tui := compass; end if;

  if compass is null then
    raise exception 'No clients found — add at least one client before seeding.';
  end if;

  select id into owner_a from profiles where role in ('user','super_admin') and active order by created_at limit 1;
  select id into owner_b from profiles where role in ('user','super_admin') and active and id <> owner_a order by created_at limit 1;
  if owner_b is null then owner_b := owner_a; end if;

  -- Reuse a real photo so the demo surveys show screen markers.
  select locations->0->>'photo_path' into photo
  from surveys
  where locations->0->>'photo_path' is not null
    and id::text not like 'd0000000-%'
  limit 1;

  -- ---------- Surveys ----------
  for s in
    select * from (values
      (1,  'Eurest — Barclays Canary Wharf',        'compass',   3,  'Reception',      '55', 'Slim Profile Mount', 2),
      (2,  'Levy — Tottenham Hotspur Stadium',      'compass',   9,  'East Concourse', '65', 'Ceiling Mount',      4),
      (3,  '14Forty — JLR Solihull',                'compass',  14,  'Main Canteen',   '43', 'Tilt Bracket',       2),
      (4,  'Eurest — GSK Brentford',                'compass',  19,  'Atrium',         '75', 'Slim Profile Mount', 1),
      (5,  'Levy — Emirates Stadium',               'compass',  23,  'North Bank Bar', '55', 'Ceiling Mount',      6),
      (6,  'Starbucks Oxford Street',               'starbucks',27,  'Order Point',    '32', 'Tilt Bracket',       2),
      (7,  'Starbucks Leeds Trinity',               'starbucks',31,  'Menu Wall',      '43', 'Tilt Bracket',       3),
      (8,  'TUI Bluewater',                         'tui',      36,  'Window Display', '50', 'Swing Arm',          2),
      (9,  'Eurest — Deloitte New Street Square',   'compass',  40,  'Cafe',           '43', 'Tilt Bracket',       2),
      (10, 'Levy — Twickenham Stadium',             'compass',  45,  'Hospitality',    '65', 'Ceiling Mount',      5),
      (11, 'Starbucks Manchester Piccadilly',       'starbucks',49,  'Counter',        '32', 'Tilt Bracket',       1),
      (12, '14Forty — Rolls Royce Derby',           'compass',  54,  'Reception',      '55', 'Slim Profile Mount', 2),
      (13, 'TUI Meadowhall',                        'tui',      58,  'Shop Front',     '50', 'Swing Arm',          3),
      (14, 'Eurest — Barclays Glasgow',             'compass',  63,  'Restaurant',     '43', 'Tilt Bracket',       3),
      (15, 'Levy — Ascot Racecourse',               'compass',  67,  'Grandstand Bar', '65', 'Ceiling Mount',      4),
      (16, 'Starbucks Birmingham New Street',       'starbucks',72,  'Menu Wall',      '43', 'Tilt Bracket',       2),
      (17, 'Eurest — Google Kings Cross',           'compass',  76,  'Ground Floor',   '75', 'Slim Profile Mount', 2),
      (18, 'TUI Cardiff Queen Street',              'tui',      81,  'Window Display', '50', 'Swing Arm',          2),
      (19, '14Forty — Nissan Sunderland',           'compass',  85,  'Canteen',        '43', 'Tilt Bracket',       4),
      (20, 'Levy — The O2',                         'compass',  90,  'Concourse',      '65', 'Ceiling Mount',      6),
      (21, 'Eurest — AstraZeneca Cambridge',        'compass',  94,  'Cafe',           '55', 'Tilt Bracket',       2),
      (22, 'Starbucks Bristol Cabot Circus',        'starbucks',99,  'Order Point',    '32', 'Tilt Bracket',       1),
      (23, 'TUI Lakeside',                          'tui',     103,  'Shop Front',     '50', 'Swing Arm',          2),
      (24, 'Levy — Wembley Stadium',                'compass', 108,  'Club Wembley',   '65', 'Ceiling Mount',      8),
      (25, 'Eurest — HSBC Canada Square',           'compass', 112,  'Staff Cafe',     '43', 'Tilt Bracket',       3),
      (26, '14Forty — BAE Warton',                  'compass', 117,  'Mess Hall',      '55', 'Slim Profile Mount', 2),
      (27, 'Starbucks Edinburgh Princes Street',    'starbucks',121, 'Menu Wall',      '43', 'Tilt Bracket',       2),
      (28, 'TUI Trafford Centre',                   'tui',     126,  'Window Display', '50', 'Swing Arm',          3),
      (29, 'Eurest — Unilever Blackfriars',         'compass', 130,  'Atrium',         '75', 'Ceiling Mount',      2),
      (30, 'Levy — Silverstone',                    'compass', 135,  'Paddock Club',   '65', 'Ceiling Mount',      5)
    ) as t(n, site, client_key, days_ago, area, size, mount, screens)
  loop
    insert into surveys (
      id, engineer_first, engineer_last, phone, survey_date, site_location,
      client_id, address, site_contact, locations,
      engineer_days, engineer_count, additional_info, submitted_at
    ) values (
      demo_id(1, s.n),
      (array['Dan','Priya','Marcus','Ellie','Tom','Aisha'])[1 + (s.n % 6)],
      (array['Whitfield','Nair','Okafor','Brennan','Hastings','Rahman'])[1 + (s.n % 6)],
      '07700 900' || lpad((100 + s.n)::text, 3, '0'),
      (current_date - s.days_ago),
      s.site,
      case s.client_key when 'starbucks' then starbucks when 'tui' then tui else compass end,
      (array['1 Churchill Place, London','High Street, Leeds','Unit 4, Retail Park','Science Park, Cambridge'])[1 + (s.n % 4)],
      (array['Site Manager','Facilities Lead','Duty Manager','Ops Coordinator'])[1 + (s.n % 4)],
      case when s.n % 4 = 0 then
        jsonb_build_array(
          demo_area(s.area, s.size, s.mount, 'Landscape', s.screens, photo, '2400x1200mm', 'Solid wall, straightforward fix.'),
          demo_area('Secondary Area', '43', 'Tilt Bracket', 'Portrait', 1, null, '900x1600mm', 'Plasterboard — needs a noggin behind.')
        )
      else
        jsonb_build_array(
          demo_area(s.area, s.size, s.mount, 'Landscape', s.screens, photo, '2400x1200mm',
            case when s.n % 3 = 0 then 'Power is 4m away, will need an extension run.' else 'Solid wall, straightforward fix.' end)
        )
      end,
      1 + (s.n % 3),
      1 + (s.n % 2),
      case when s.n % 5 = 0 then 'Client asked about a phase 2 in the upstairs bar.' else '' end,
      (now() - (s.days_ago || ' days')::interval)
    );
  end loop;

  -- ---------- Installs (a subset of sites, later than their survey) ----------
  for n in 1..15 loop
    insert into installations (
      id, engineer_first, engineer_last, phone, install_date, site_location,
      client_id, address, site_contact, locations, additional_info,
      signed_by, submitted_at
    )
    select
      demo_id(2, n),
      (array['Dan','Priya','Marcus','Ellie'])[1 + (n % 4)],
      (array['Whitfield','Nair','Okafor','Brennan'])[1 + (n % 4)],
      '07700 900' || lpad((200 + n)::text, 3, '0'),
      sv.survey_date + 21,
      sv.site_location,
      sv.client_id,
      sv.address,
      sv.site_contact,
      jsonb_build_array(jsonb_build_object(
        'area_name', sv.locations->0->>'area_name',
        'screens', (
          select jsonb_agg(jsonb_build_object(
            'photo_path', null,
            'installed', case when n = 7 and i = 2 then 'No' else 'Yes' end,
            'notes', case when n = 7 and i = 2 then 'Bracket wrong size — returning next week.' else '' end))
          from generate_series(1, jsonb_array_length(sv.locations->0->'screens')) i
        )
      )),
      case when n = 7 then 'One screen outstanding, parts on order.' else '' end,
      (array['J. Fielding','S. Kaur','M. Doyle','R. Chen'])[1 + (n % 4)],
      (now() - ((sv_days - 21) || ' days')::interval)
    from surveys sv
    cross join lateral (select (current_date - sv.survey_date)::int as sv_days) d
    where sv.id = demo_id(1, n) and d.sv_days > 25;
  end loop;

  -- ---------- Visits (callouts) ----------
  for n in 1..12 loop
    insert into visits (
      id, engineer_first, engineer_last, phone, visit_date, site_location,
      client_id, address, site_contact, issues, additional_info, submitted_at
    )
    select
      demo_id(3, n),
      (array['Marcus','Ellie','Tom','Aisha'])[1 + (n % 4)],
      (array['Okafor','Brennan','Hastings','Rahman'])[1 + (n % 4)],
      '07700 900' || lpad((300 + n)::text, 3, '0'),
      (current_date - (n * 6)),
      sv.site_location,
      sv.client_id,
      sv.address,
      sv.site_contact,
      jsonb_build_array(jsonb_build_object(
        'title', (array['Screen not powering on','Image frozen','No network','Flickering panel','Mount loose'])[1 + (n % 5)],
        'problem_photo_path', null,
        'fix', (array['Replaced faulty PSU.','Power-cycled and updated firmware.','Re-terminated the data run.','Swapped panel under warranty.','Re-fixed bracket to a stud.'])[1 + (n % 5)],
        'working_photo_path', null,
        'resolved', case when n % 4 = 0 then 'No' else 'Yes' end
      )),
      case when n % 4 = 0 then 'Return visit needed once the part arrives.' else '' end,
      (now() - ((n * 6) || ' days')::interval)
    from surveys sv where sv.id = demo_id(1, 1 + (n % 30));
  end loop;

  -- ---------- Projects ----------
  -- Mixed statuses, owners and dates so the board, the list filters and the
  -- home page panels all have something real to show.
  for s in
    select * from (values
      (1,  'Eurest — Canary Wharf screen refresh',  'compass',   'new',            'high',   3,   14, 'manual', true, 2),
      (2,  'Levy — Spurs concourse rollout',        'compass',   'with_client',    'urgent', 7,    5, 'manual', true, 12),
      (3,  '14Forty — JLR canteen screens',         'compass',   'estimating',     'normal', 12,  21, 'manual', true, 4),
      (4,  'Eurest — GSK atrium video wall',        'compass',   'designs',        'high',   18,  30, 'manual', false, 6),
      (5,  'Levy — Emirates matchday screens',      'compass',   'install_booked', 'urgent', 25,   9, 'manual', true, 18),
      (6,  'Starbucks — Oxford St menu boards',     'starbucks', 'complete',       'normal', 40, -20, 'manual', true, 3),
      (7,  'Starbucks — Leeds Trinity refit',       'starbucks', 'on_hold',        'low',    33,  60, 'manual', false, null),
      (8,  'TUI — Bluewater window display',        'tui',       'new',            'normal', 2,   28, 'intake', false, 2),
      (9,  'Eurest — Deloitte cafe screens',        'compass',   'estimating',     'normal', 45,  18, 'manual', true, 5),
      (10, 'Levy — Twickenham hospitality',         'compass',   'with_client',    'high',   30,   3, 'manual', true, 14),
      (11, 'Starbucks — Manchester counter screen', 'starbucks', 'complete',       'low',    55, -30, 'manual', true, 1),
      (12, '14Forty — Rolls Royce reception',       'compass',   'install_booked', 'normal', 21,  12, 'manual', true, 3),
      (13, 'TUI — Meadowhall shop front',           'tui',       'new',            'normal', 1,   35, 'intake', false, null),
      (14, 'Eurest — Barclays Glasgow restaurant',  'compass',   'designs',        'normal', 38,  25, 'manual', true, 6),
      (15, 'Levy — Ascot grandstand',               'compass',   'cancelled',      'low',    60,  null,'manual', true, 9),
      (16, 'Eurest — Google KX ground floor',       'compass',   'estimating',     'high',   28,  16, 'manual', false, 4),
      (17, 'Levy — The O2 concourse',               'compass',   'with_client',    'urgent', 41,  -2, 'manual', true, 22),
      (18, 'Starbucks — Bristol order point',       'starbucks', 'new',            'normal', 4,   40, 'intake', false, null),
      (19, 'Levy — Wembley Club',                   'compass',   'designs',        'high',   50,  22, 'manual', true, 26),
      (20, 'Eurest — Unilever atrium',              'compass',   'on_hold',        'normal', 47,  null,'manual', true, 3)
    ) as t(n, title, client_key, status, priority, created_days_ago, due_in_days, source, has_owner, screens)
  loop
    insert into projects (
      id, client_id, title, reference, site_location, address, description,
      requested_by, requester_email, status, priority, due_date, source,
      owner_id, screen_count, created_at, last_activity_at
    ) values (
      demo_id(4, s.n),
      case s.client_key when 'starbucks' then starbucks when 'tui' then tui else compass end,
      s.title,
      upper(left(s.client_key, 3)) || '-' || lpad((2000 + s.n)::text, 4, '0'),
      split_part(s.title, ' — ', 2),
      (array['1 Churchill Place, London','High Street, Leeds','Unit 4, Retail Park','Science Park, Cambridge'])[1 + (s.n % 4)],
      'Proposed screen installation. Raised from the ' || s.client_key || ' account.',
      case when s.source = 'intake' then (array['Hannah Price','Owen Docherty','Nadia Kaur'])[1 + (s.n % 3)] else null end,
      case when s.source = 'intake' then 'requests@example.com' else null end,
      s.status,
      s.priority,
      case when s.due_in_days is null then null else (current_date + s.due_in_days) end,
      s.source,
      case when s.has_owner then (case when s.n % 2 = 0 then owner_a else owner_b end) else null end,
      s.screens,
      (now() - (s.created_days_ago || ' days')::interval),
      -- Two projects deliberately left stale so the home page's "gone quiet"
      -- panel has something in it.
      case when s.n in (4, 16) then (now() - interval '26 days') else (now() - ((s.created_days_ago / 2) || ' days')::interval) end
    );
  end loop;

  -- ---------- Tasks on manual projects ----------
  -- Intake projects get theirs from the auto-apply template, if you have one.
  for n in 1..20 loop
    if n not in (8, 13, 18) then
      insert into project_tasks (id, project_id, title, position, due_date, completed_at, completed_by)
      select
        demo_id(5, n * 10 + i),
        demo_id(4, n),
        (array['Order hardware','Arrange survey','Confirm mounting spec','Book install date','Send client sign-off'])[i],
        i,
        current_date + (i * 5) - 10,
        case when i <= (n % 4) then now() - ((n % 9) || ' days')::interval else null end,
        case when i <= (n % 4) then 'Christopher Barlow' else null end
      from generate_series(1, 5) i;
    end if;
  end loop;

  -- ---------- Notes and activity ----------
  for n in 1..20 loop
    insert into project_notes (id, project_id, author_id, author_name, body, created_at)
    values (
      demo_id(6, n), demo_id(4, n), owner_a, 'Christopher Barlow',
      (array[
        'Client has asked whether we can bring the install forward a week.',
        'Waiting on the landlord to confirm access out of hours.',
        'Quote sent over — chasing on Friday if nothing back.',
        'Site contact changed, updated details above.',
        'Parts lead time is 3 weeks, factored into the date.'
      ])[1 + (n % 5)],
      (now() - ((n % 12) || ' days')::interval)
    );
  end loop;

  -- Activity written last, then last_activity_at is restored — the trigger from
  -- migration 025 would otherwise stamp every demo project as active today and
  -- the "gone quiet" panel would be empty.
  for n in 1..20 loop
    insert into project_activity (id, project_id, actor_name, action, detail, created_at)
    values (
      demo_id(7, n), demo_id(4, n), 'Christopher Barlow', 'Status changed',
      'New Enquiry → ' || initcap(replace((select status from projects where id = demo_id(4, n)), '_', ' ')),
      (now() - ((n % 15) || ' days')::interval)
    );
  end loop;

  update projects
  set last_activity_at = case when id in (demo_id(4, 4), demo_id(4, 16))
    then now() - interval '26 days'
    else now() - ((extract(epoch from (now() - created_at)) / 86400 / 2) || ' days')::interval end
  where id::text like 'd0000000-%';

  -- ---------- Link some site records to their projects ----------
  update surveys       set project_id = demo_id(4, 1) where id = demo_id(1, 1);
  update surveys       set project_id = demo_id(4, 2) where id = demo_id(1, 2);
  update surveys       set project_id = demo_id(4, 5) where id = demo_id(1, 5);
  update installations set project_id = demo_id(4, 5) where id = demo_id(2, 5);
  update installations set project_id = demo_id(4, 6) where id = demo_id(2, 6);
end $$;

drop function if exists demo_area(text, text, text, text, int, text, text, text);
drop function if exists demo_id(int, int);

-- ============================================================
-- What you should see afterwards
-- ============================================================
--   /home       overdue tasks, unassigned requests, two projects gone quiet
--   /dashboard  30 surveys — two pages, so pagination is exercised
--   /projects   20 projects across every status, with a screen total in the strip
--   /projects/board  every column populated
--   /sites      grouped venues, several with a survey AND an install
--   /visits     12 callouts, some unresolved
