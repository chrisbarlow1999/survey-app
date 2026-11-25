-- Live Project Tracker → platform UPDATE (prepared 25/11/2026)
-- Run in Supabase → SQL Editor, AFTER live-project-tracker-import.sql and
-- live-project-tracker-update-2026-11-24.sql.
--
-- WHAT CHANGED IN THE TRACKER
--   New columns  — No. of Screens and Sell Value. Each project gets its total
--                  sell value and screen count; each site gets its own screen
--                  count, and its value + hardware written into its notes.
--   Porsche      — install now "ASAP" (screen comes to Linney 27/11, then site),
--                  so the 27/11 install date is cleared.
--   Harrods      — new RAMs required.
--   RTX Prestwick— 4G router now ordered internally, direct to site.
--   Exxon        — hardware ordered; go live 04/01/27 (added as a dated task).
--   Kildare      — hardware ordered, profiled, engineers booked.
--   Man Utd      — install team now Index (was Liam & Tommy); chaser sent 25/11.
--   UCLH         — install team Index.
--   DHL          — survey moved to 01/12.
--   Parker Meggitt — cost centres for all three sites, plus new site notes.
--   NEW          — NEC UAB and NEC BPP (Compass sectors "NEC UAB" / "NEC BPP").
--
-- SAFE WITH YOUR EDITS
-- Every field change has the value the platform had before ("from") and the
-- tracker's new value ("to"). It's only applied if the field still holds the
-- "from" value — so anything you've changed in the platform since is left
-- alone. Notes, site-note lines and tasks are only added if not already there.
-- Re-running changes nothing the second time.
--
-- All or nothing: if a project or site can't be found, it stops, lists them,
-- and writes nothing.

do $$
declare
  client_name constant text := 'Compass';
  importer constant text := 'Live Project Tracker import';
  imported_desc constant text := 'Imported from the Live Project Tracker spreadsheet on 24/11/2026.';

  -- "set": { column: [from, to] }   "append": lines added to the site's notes
  updates jsonb := $json$[
    {
      "title": "Porsche Reading",
      "set": {"value_gbp": [null, 405], "screen_count": [null, 1]},
      "sites": [{"site": "Porsche Reading",
                 "set": {"install_date": ["2026-11-27", null], "screen_count": [null, 1]},
                 "append": ["Sell value £405. Hardware: 1x 13\" (replacement screen)"]}],
      "notes": ["Screen arriving to Linney 27/11 (replacement for the 13\") → stage → send to site. Install ASAP."]
    },
    {
      "title": "Harrods Thatcham",
      "set": {"value_gbp": [null, 3834.52]},
      "sites": [{"site": "Harrods Thatcham",
                 "set": {"rams_required": [null, true]},
                 "append": ["Sell value £3,834.52. Hardware: 4x 50\""]}],
      "notes": ["Require new RAMs"],
      "tasks": [{"title": "Get new RAMs"}]
    },
    {
      "title": "RTX",
      "set": {"value_gbp": [null, 5834.08], "screen_count": [null, 3]},
      "sites": [
        {"site": "RTX Birmingham",    "set": {"screen_count": [null, 1]}, "append": ["Sell value £1,416.86. Hardware: 1x 43\""]},
        {"site": "RTX Wolverhampton", "set": {"screen_count": [null, 1]}, "append": ["Sell value £1,416.86. Hardware: 1x 43\""]},
        {"site": "RTX Prestwick",     "append": ["Sell value £1,463.50. Hardware: 1x Samsung media player (no screen)",
                                                 "4G router now being ordered internally, direct to site (not via Airwave)"]},
        {"site": "RTX NI",            "set": {"screen_count": [null, 1]}, "append": ["Sell value £1,536.86. Hardware: 1x 43\""]}
      ]
    },
    {
      "title": "Teva Runcorn",
      "set": {"value_gbp": [null, 592.50], "screen_count": [null, 0]},
      "sites": [{"site": "Teva Runcorn", "set": {"screen_count": [null, 0]},
                 "append": ["Sell value £592.50. No new screens"]}]
    },
    {
      "title": "Exxon Fawley",
      "set": {"value_gbp": [null, 1287.45], "screen_count": [null, 1]},
      "sites": [{"site": "Exxon Fawley", "set": {"screen_count": [null, 1]},
                 "append": ["Sell value £1,287.45. Hardware: 1x 55\""]}],
      "notes": ["Hardware ordered. Go live 04/01/2027."],
      "tasks": [{"title": "Go live", "due": "2027-01-04"}]
    },
    {
      "title": "Kildare Innovation Centre",
      "set": {"value_gbp": [null, 4509.02], "screen_count": [null, 3]},
      "sites": [{"site": "Kildare Innovation Centre", "set": {"screen_count": [null, 3]},
                 "append": ["Sell value £4,509.02. Hardware: 1x 32\", 1x 43\", 1x 50\" totem"]}],
      "notes": ["Hardware ordered, profiled, engineers booked."]
    },
    {
      "title": "Man United Paddock",
      "sites": [{"site": "Man United Paddock", "set": {"install_company": ["Liam & Tommy", "Index"]}}],
      "notes": ["Chaser sent 25/11"]
    },
    {
      "title": "UCLH 250ER",
      "sites": [{"site": "UCLH 250ER", "set": {"install_company": [null, "Index"]}}]
    },
    {
      "title": "DHL Avonmouth",
      "notes": ["Survey moved to 01/12 (was 27/11). Job number drafted."]
    },
    {
      "title": "Parker Meggitt",
      "sites": [
        {"site": "Parker Meggitt Ansty Park",   "set": {"cost_centre": [null, "47366001"]}, "append": ["Covering the window panels"]},
        {"site": "Parker Meggitt Loughborough", "set": {"cost_centre": [null, "47365001"]}, "append": ["1 screen above coffee machines"]},
        {"site": "Parker Meggitt Fareham",      "set": {"cost_centre": [null, "47367001"]},
         "append": ["Install team: maybe Airwave (TBC)", "Screen locations to be confirmed, and how many"]}
      ],
      "notes": ["Job numbers drafted for all three sites."]
    },
    {
      "title": "Parklands",
      "set": {"value_gbp": [null, 1367.45], "screen_count": [null, 1]},
      "sites": [{"site": "Parklands", "set": {"screen_count": [null, 1]},
                 "append": ["Sell value £1,367.45. Hardware: 1x 50\""]}]
    },
    {
      "title": "London Southbank Uni",
      "set": {"value_gbp": [null, 9013.79]},
      "sites": [{"site": "London Southbank Uni", "append": ["Sell value £9,013.79. Number of screens TBC"]}]
    }
  ]$json$;

  new_projects jsonb := $json$[
    {
      "sector": "NEC UAB", "title": "NEC UAB", "status": "estimating",
      "note": "Cost sheet. Install 19/02/2027 or 22/02/2027 (TBC).",
      "sites": [{"site_name": "NEC", "status": "pending", "notes": "Install 19/02/2027 or 22/02/2027 (TBC)"}]
    },
    {
      "sector": "NEC BPP", "title": "NEC BPP", "status": "estimating",
      "note": "Cost sheet. Install W/C 11/01/2027.",
      "sites": [{"site_name": "NEC", "status": "pending", "install_date": "2027-01-11", "notes": "Install W/C 11/01/2027"}]
    }
  ]$json$;

  client uuid;
  sector uuid;
  pid uuid;
  sid uuid;
  u jsonb;
  s jsonb;
  t jsonb;
  f text;
  line text;
  n integer;
  missing text := '';
  changes text[];
  new_project uuid;
  site_idx integer;
  added integer := 0;
  skipped text := '';
begin
  client := (select id from clients where lower(name) = lower(client_name));
  if client is null then
    raise exception 'No client called "%" found. Nothing was changed.', client_name;
  end if;

  -- 1. Everything being updated must exist (exactly once).
  for u in select * from jsonb_array_elements(updates) loop
    n := (select count(*) from projects
          where client_id = client and lower(title) = lower(u ->> 'title') and archived_at is null);
    if n <> 1 then
      missing := missing || format(E'\n  project "%s" (found %s)', u ->> 'title', n);
      continue;
    end if;
    pid := (select id from projects
            where client_id = client and lower(title) = lower(u ->> 'title') and archived_at is null);
    for s in select * from jsonb_array_elements(coalesce(u -> 'sites', '[]'::jsonb)) loop
      if not exists (select 1 from project_sites where project_id = pid and lower(site_name) = lower(s ->> 'site')) then
        missing := missing || format(E'\n  site "%s" on project "%s"', s ->> 'site', u ->> 'title');
      end if;
    end loop;
  end loop;
  if missing <> '' then
    raise exception E'Couldn''t find these in the platform (renamed or archived?). Nothing was changed.%', missing;
  end if;

  -- 2. Apply the updates.
  for u in select * from jsonb_array_elements(updates) loop
    changes := '{}';
    pid := (select id from projects
            where client_id = client and lower(title) = lower(u ->> 'title') and archived_at is null);

    -- Project fields: only where the field still holds the "from" value.
    for f in select jsonb_object_keys(coalesce(u -> 'set', '{}'::jsonb)) loop
      execute format(
        'update projects set %1$I = (jsonb_populate_record(null::projects, $1)).%1$I
          where id = $2 and %1$I is not distinct from (jsonb_populate_record(null::projects, $3)).%1$I', f)
        using jsonb_build_object(f, u -> 'set' -> f -> 1), pid, jsonb_build_object(f, u -> 'set' -> f -> 0);
      get diagnostics n = row_count;
      if n > 0 then
        changes := array_append(changes, format('%s → %s',
          case f when 'value_gbp' then 'Value' when 'screen_count' then 'Screens' else f end,
          coalesce(u -> 'set' -> f ->> 1, 'cleared')));
      end if;
    end loop;

    -- Sites.
    for s in select * from jsonb_array_elements(coalesce(u -> 'sites', '[]'::jsonb)) loop
      sid := (select id from project_sites where project_id = pid and lower(site_name) = lower(s ->> 'site')
              order by position limit 1);

      for f in select jsonb_object_keys(coalesce(s -> 'set', '{}'::jsonb)) loop
        execute format(
          'update project_sites set %1$I = (jsonb_populate_record(null::project_sites, $1)).%1$I
            where id = $2 and %1$I is not distinct from (jsonb_populate_record(null::project_sites, $3)).%1$I', f)
          using jsonb_build_object(f, s -> 'set' -> f -> 1), sid, jsonb_build_object(f, s -> 'set' -> f -> 0);
        get diagnostics n = row_count;
        if n > 0 then
          changes := array_append(changes, format('%s: %s → %s', s ->> 'site',
            case f
              when 'screen_count' then 'Screens'
              when 'install_date' then 'Install date'
              when 'install_company' then 'Install team'
              when 'cost_centre' then 'Cost centre'
              when 'rams_required' then 'RAMS required'
              else f end,
            coalesce(s -> 'set' -> f ->> 1, 'cleared')));
        end if;
      end loop;

      for line in select jsonb_array_elements_text(coalesce(s -> 'append', '[]'::jsonb)) loop
        update project_sites set notes = concat_ws(E'\n', nullif(notes, ''), line)
        where id = sid and position(line in coalesce(notes, '')) = 0;
        get diagnostics n = row_count;
        if n > 0 then changes := array_append(changes, format('%s: note "%s"', s ->> 'site', line)); end if;
      end loop;
    end loop;

    -- Project notes.
    for line in select jsonb_array_elements_text(coalesce(u -> 'notes', '[]'::jsonb)) loop
      if not exists (select 1 from project_notes where project_id = pid and body = line) then
        insert into project_notes (project_id, author_name, body) values (pid, importer, line);
        changes := array_append(changes, 'Note added');
      end if;
    end loop;

    -- Tasks.
    for t in select * from jsonb_array_elements(coalesce(u -> 'tasks', '[]'::jsonb)) loop
      if not exists (select 1 from project_tasks where project_id = pid and title = t ->> 'title') then
        insert into project_tasks (project_id, title, position, due_date)
        values (pid, t ->> 'title',
                coalesce((select max(pt.position) + 1 from project_tasks pt where pt.project_id = pid), 0),
                nullif(t ->> 'due', '')::date);
        changes := array_append(changes, format('Task "%s"', t ->> 'title'));
      end if;
    end loop;

    if cardinality(changes) > 0 then
      update projects set last_activity_at = now() where id = pid;
      insert into project_activity (project_id, actor_name, action, detail)
      values (pid, importer, 'Updated from tracker', array_to_string(changes, '; '));
    end if;
  end loop;

  -- 3. New projects. Create any missing sectors first.
  insert into client_sectors (client_id, name)
  select distinct client, x ->> 'sector'
  from jsonb_array_elements(new_projects) x
  where not exists (
    select 1 from client_sectors existing
    where existing.client_id = client and lower(trim(existing.name)) = lower(trim(x ->> 'sector'))
  );

  for u in select * from jsonb_array_elements(new_projects) loop
    if exists (
      select 1 from projects
      where client_id = client and lower(title) = lower(u ->> 'title') and archived_at is null
    ) then
      skipped := skipped || ' ' || (u ->> 'title') || ';';
      continue;
    end if;

    sector := (select id from client_sectors
               where client_id = client and lower(trim(name)) = lower(trim(u ->> 'sector')));

    insert into projects (
      client_id, sector_id, title, site_location, description,
      status, priority, source, last_activity_at
    ) values (
      client, sector, u ->> 'title',
      (select string_agg(x ->> 'site_name', ', ' order by o) from jsonb_array_elements(u -> 'sites') with ordinality as q(x, o)),
      imported_desc, u ->> 'status', 'normal', 'manual', now()
    )
    returning id into new_project;

    site_idx := 0;
    for s in select * from jsonb_array_elements(u -> 'sites') loop
      insert into project_sites (project_id, position, site_name, notes, status, install_date)
      values (new_project, site_idx, s ->> 'site_name', nullif(s ->> 'notes', ''), s ->> 'status',
              nullif(s ->> 'install_date', '')::date);
      site_idx := site_idx + 1;
    end loop;

    if coalesce(u ->> 'note', '') <> '' then
      insert into project_notes (project_id, author_name, body) values (new_project, importer, u ->> 'note');
    end if;

    insert into project_activity (project_id, actor_name, action, detail)
    values (new_project, importer, 'Project imported',
            site_idx || ' site(s) from the Live Project Tracker spreadsheet');
    added := added + 1;
  end loop;

  raise notice 'Updates applied. Added % new project(s).%', added,
    case when skipped <> '' then ' Skipped (already exist):' || skipped else '' end;
end;
$$;

-- Everything from the tracker as it now stands, with what this run changed:
select cs.name as sector, p.title, p.status, p.value_gbp as value, p.screen_count as screens,
       p.install_date, p.install_company,
       (select count(*) from project_sites s where s.project_id = p.id) as sites,
       (select count(*) from project_tasks t where t.project_id = p.id and t.completed_at is null) as open_tasks,
       (select a.detail from project_activity a
         where a.project_id = p.id and a.actor_name = 'Live Project Tracker import'
           and a.created_at > now() - interval '10 minutes'
         order by a.created_at desc limit 1) as changed_just_now
from projects p
left join client_sectors cs on cs.id = p.sector_id
where p.description = 'Imported from the Live Project Tracker spreadsheet on 24/11/2026.'
order by cs.name, p.title;
