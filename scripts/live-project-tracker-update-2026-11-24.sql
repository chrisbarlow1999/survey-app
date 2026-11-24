-- Live Project Tracker → platform UPDATE (prepared 24/11/2026)
-- Run in Supabase → SQL Editor, AFTER the original "Live Project Tracker import.sql".
--
-- Part 1 brings two already-imported projects up to date with the tracker:
--   • Exxon Fawley     — sign off completed: job no. 177185-15-1 added as the
--                        reference, moved to Install Booked (2/12, B&B), the
--                        "Brief drafted on SD" task ticked off, note added.
--   • Harrods Thatcham — install team now "Index/Tommy & Liam" (was B&B),
--                        delivery now due 25/11 (was 23/11).
--   Each change only applies if the field still holds the value the first
--   import gave it, so anything you've changed in the platform since is left alone.
--
-- Part 2 adds the three new rows from the bottom of the tracker:
--   • Christ The King College (Chartwells) — Survey stage, install Feb
--   • Goodwood Racecourse (Levy)            — Costing, install March
--   • TUI (Eurest)                          — Enquired
--   Any of these that already exist under Compass are skipped, not duplicated.
--
-- All or nothing: if a project to update can't be found, it stops with a message
-- and writes nothing. Safe to re-run — a second run changes nothing.

do $$
declare
  client_name constant text := 'Compass';
  importer constant text := 'Live Project Tracker import';
  imported_desc constant text := 'Imported from the Live Project Tracker spreadsheet on 24/11/2026.';

  new_projects jsonb := $json$[
    {
      "sector": "Chartwells", "title": "Christ The King College", "status": "estimating",
      "note": "Survey stage. Install planned for February (date TBC).",
      "sites": [{"site_name": "Christ The King College", "status": "pending", "notes": "Install planned for February (date TBC)"}]
    },
    {
      "sector": "Levy", "title": "Goodwood Racecourse", "status": "estimating",
      "note": "Costing. Install planned for March (date TBC).",
      "sites": [{"site_name": "Goodwood Racecourse", "status": "pending", "notes": "Install planned for March (date TBC)"}]
    },
    {
      "sector": "Eurest", "title": "TUI", "status": "new",
      "note": "Enquired",
      "sites": [{"site_name": "TUI", "status": "pending"}]
    }
  ]$json$;

  client uuid;
  sector uuid;
  exxon uuid;
  harrods uuid;
  n integer;
  changes text[];
  p jsonb;
  s jsonb;
  new_project uuid;
  site_idx integer;
  added integer := 0;
  skipped text := '';
begin
  -- 1. Find Compass and the two projects being updated.
  select id into client from clients where lower(name) = lower(client_name);
  if client is null then
    raise exception 'No client called "%" found. Nothing was changed.', client_name;
  end if;

  select count(*), min(id::text)::uuid into n, exxon
  from projects where client_id = client and lower(title) = 'exxon fawley' and archived_at is null;
  if n <> 1 then
    raise exception 'Expected one live Compass project called "Exxon Fawley", found %. Nothing was changed.', n;
  end if;

  select count(*), min(id::text)::uuid into n, harrods
  from projects where client_id = client and lower(title) = 'harrods thatcham' and archived_at is null;
  if n <> 1 then
    raise exception 'Expected one live Compass project called "Harrods Thatcham", found %. Nothing was changed.', n;
  end if;

  -- 2. Exxon Fawley — sign off completed.
  changes := '{}';

  update projects set reference = '177185-15-1'
  where id = exxon and reference is null;
  get diagnostics n = row_count;
  if n > 0 then changes := array_append(changes, 'Reference set to 177185-15-1'::text); end if;

  update projects set status = 'install_booked'
  where id = exxon and status = 'with_client';
  get diagnostics n = row_count;
  if n > 0 then changes := array_append(changes, 'Status With Client → Install Booked'::text); end if;

  -- The site carries the install booking; the project picks it up from here.
  update project_sites set status = 'install_booked'
  where project_id = exxon and lower(site_name) = 'exxon fawley' and status = 'surveyed';
  get diagnostics n = row_count;
  if n > 0 then changes := array_append(changes, 'Site Surveyed → Install booked'::text); end if;

  update project_tasks set completed_at = now(), completed_by = importer
  where project_id = exxon and title = 'Brief drafted on SD' and completed_at is null;
  get diagnostics n = row_count;
  if n > 0 then changes := array_append(changes, 'Ticked off "Brief drafted on SD"'::text); end if;

  if not exists (select 1 from project_notes where project_id = exxon and body = 'Sign off completed') then
    insert into project_notes (project_id, author_name, body) values (exxon, importer, 'Sign off completed');
  end if;

  if cardinality(changes) > 0 then
    update projects set last_activity_at = now() where id = exxon;
    insert into project_activity (project_id, actor_name, action, detail)
    values (exxon, importer, 'Updated from tracker', array_to_string(changes, '; '));
  end if;

  -- 3. Harrods Thatcham — new install team and delivery date.
  changes := '{}';

  update project_sites set install_company = 'Index/Tommy & Liam'
  where project_id = harrods and lower(site_name) = 'harrods thatcham' and install_company = 'B&B';
  get diagnostics n = row_count;
  if n > 0 then changes := array_append(changes, 'Install team B&B → Index/Tommy & Liam'::text); end if;

  if not exists (select 1 from project_notes where project_id = harrods and body like 'Delivery now due 25/11%') then
    insert into project_notes (project_id, author_name, body)
    values (harrods, importer, 'Delivery now due 25/11 (was 23/11). Installing 4x 50" screens with pattressing');
    changes := array_append(changes, 'Delivery date moved to 25/11'::text);
  end if;

  if cardinality(changes) > 0 then
    update projects set last_activity_at = now() where id = harrods;
    insert into project_activity (project_id, actor_name, action, detail)
    values (harrods, importer, 'Updated from tracker', array_to_string(changes, '; '));
  end if;

  -- 4. New projects. Create any missing sectors first.
  insert into client_sectors (client_id, name)
  select distinct client, x ->> 'sector'
  from jsonb_array_elements(new_projects) x
  where not exists (
    select 1 from client_sectors existing
    where existing.client_id = client and lower(trim(existing.name)) = lower(trim(x ->> 'sector'))
  );

  for p in select * from jsonb_array_elements(new_projects) loop
    if exists (
      select 1 from projects
      where client_id = client and lower(title) = lower(p ->> 'title') and archived_at is null
    ) then
      skipped := skipped || ' ' || (p ->> 'title') || ';';
      continue;
    end if;

    select id into sector from client_sectors
    where client_id = client and lower(trim(name)) = lower(trim(p ->> 'sector'));

    insert into projects (
      client_id, sector_id, title, reference, site_location, description,
      status, priority, source, last_activity_at
    ) values (
      client,
      sector,
      p ->> 'title',
      nullif(trim(p ->> 'reference'), ''),
      (select string_agg(x ->> 'site_name', ', ' order by o) from jsonb_array_elements(p -> 'sites') with ordinality as q(x, o)),
      imported_desc,
      p ->> 'status',
      'normal',
      'manual',
      now()
    )
    returning id into new_project;

    site_idx := 0;
    for s in select * from jsonb_array_elements(p -> 'sites') loop
      insert into project_sites (project_id, position, site_name, notes, status)
      values (new_project, site_idx, s ->> 'site_name', nullif(s ->> 'notes', ''), s ->> 'status');
      site_idx := site_idx + 1;
    end loop;

    if coalesce(p ->> 'note', '') <> '' then
      insert into project_notes (project_id, author_name, body)
      values (new_project, importer, p ->> 'note');
    end if;

    insert into project_activity (project_id, actor_name, action, detail)
    values (new_project, importer, 'Project imported',
            site_idx || ' site(s) from the Live Project Tracker spreadsheet');
    added := added + 1;
  end loop;

  raise notice 'Updated Exxon Fawley and Harrods Thatcham. Added % new project(s).%', added,
    case when skipped <> '' then ' Skipped (already exist):' || skipped else '' end;
end;
$$;

-- Everything from the tracker, as it now stands:
select c.name as client, cs.name as sector, p.title, p.reference, p.status, p.install_date, p.install_company,
       (select count(*) from project_sites s where s.project_id = p.id) as sites,
       (select count(*) from project_tasks t where t.project_id = p.id and t.completed_at is null) as open_tasks
from projects p
join clients c on c.id = p.client_id
left join client_sectors cs on cs.id = p.sector_id
where p.description = 'Imported from the Live Project Tracker spreadsheet on 24/11/2026.'
order by cs.name, p.title;
