-- Live Project Tracker → platform import (prepared 24/11/2026)
-- Run once in Supabase → SQL Editor, AFTER migration 047 (client sectors).
--
-- Every project goes under the Compass client, with the spreadsheet's Sector
-- column as its Compass sector (Eurest, Ireland, Levy, Hospitals, 14Forty,
-- Chartwells, BDO). Any of those sectors that don't exist yet are created.
--
-- Creates 13 projects (2 multi-site: RTX ×4, Parker Meggitt ×3), 18 sites,
-- tasks from the to-do lines in the Status column, and a note on each project
-- holding the tracker's status comment.
--
-- All or nothing: if the Compass client isn't found, or a Compass project with
-- the same title already exists, it stops with a message and writes nothing.

do $$
declare
  client_name constant text := 'Compass';

  data jsonb := $json$[
    {
      "sector": "Eurest", "title": "RTX", "status": "install_booked",
      "sites": [
        {"site_name": "RTX Birmingham",    "cost_centre": "47325001", "job_no": "150574-283-1", "install_date": "2026-11-30", "install_company": "B&B",      "status": "install_booked", "notes": "On track"},
        {"site_name": "RTX Wolverhampton", "cost_centre": "47326001", "job_no": "150574-284-1", "install_date": "2026-11-30", "install_company": "B&B",      "status": "install_booked", "notes": "On track"},
        {"site_name": "RTX Prestwick",     "cost_centre": "47323001", "job_no": "150574-281-1", "install_date": "2026-11-30", "install_company": "Airwave",  "status": "install_booked", "notes": "4G router requested to be ordered by Airwave"},
        {"site_name": "RTX NI",            "cost_centre": "47324001", "job_no": "150574-282-1", "install_date": "2026-11-30", "install_company": "ThinkPM",  "status": "install_booked", "notes": "On track"}
      ]
    },
    {
      "sector": "Eurest", "title": "Parker Meggitt", "status": "with_client",
      "note": "Install W/C 14/12 for all three sites (exact days TBC).",
      "sites": [
        {"site_name": "Parker Meggitt Ansty Park",   "install_date": "2026-12-14", "status": "surveyed", "notes": "Install W/C 14/12. Awaiting location confirmation for screens based from survey images",
         "tasks": ["Brief on SD drafted", "Order hardware", "Profile"]},
        {"site_name": "Parker Meggitt Loughborough", "install_date": "2026-12-14", "status": "surveyed", "notes": "Install W/C 14/12. Can create survey visuals and cost sheet once preferences provided",
         "tasks": ["Brief on SD drafted", "Order hardware", "Profile"]},
        {"site_name": "Parker Meggitt Fareham",      "install_date": "2026-12-14", "status": "surveyed", "notes": "Install W/C 14/12. Can create survey visuals and cost sheet once preferences provided",
         "tasks": ["Brief on SD drafted", "Order hardware", "Profile"]}
      ]
    },
    {
      "sector": "Eurest", "title": "Exxon Fawley", "status": "with_client",
      "note": "Awaiting sign off",
      "tasks": ["Brief drafted on SD", "RAMs doc requested", "Profile"],
      "sites": [{"site_name": "Exxon Fawley", "cost_centre": "98852001", "install_date": "2026-12-02", "install_company": "B&B", "status": "surveyed", "rams_required": true}]
    },
    {
      "sector": "Eurest", "title": "Porsche Reading", "reference": "150574-277-1", "status": "install_booked",
      "note": "Screen arriving on site 27/11 (this is a screen replacement for 13\")",
      "sites": [{"site_name": "Porsche Reading", "cost_centre": "87425001", "install_date": "2026-11-27", "status": "install_booked"}]
    },
    {
      "sector": "Ireland", "title": "Kildare Innovation Centre", "reference": "150574-263-1", "status": "install_booked",
      "sites": [{"site_name": "Kildare Innovation Centre", "cost_centre": "47333001", "install_date": "2026-12-02", "install_company": "ThinkPM", "status": "install_booked"}]
    },
    {
      "sector": "Levy", "title": "Man United Paddock", "status": "install_booked",
      "sites": [{"site_name": "Man United Paddock", "install_date": "2026-12-14", "install_company": "Liam & Tommy", "status": "install_booked"}]
    },
    {
      "sector": "Hospitals", "title": "UCLH 250ER", "status": "estimating",
      "note": "Cost approved - survey required",
      "sites": [{"site_name": "UCLH 250ER", "install_date": "2026-12-14", "status": "pending"}]
    },
    {
      "sector": "14Forty", "title": "Parklands", "reference": "150574-239-1", "status": "designs",
      "note": "1x screen needs ordering & installing",
      "sites": [{"site_name": "Parklands", "status": "approved"}]
    },
    {
      "sector": "Chartwells", "title": "London Southbank Uni", "reference": "150574-237-1", "status": "new",
      "sites": [{"site_name": "London Southbank Uni", "cost_centre": "98783001", "status": "pending"}]
    },
    {
      "sector": "Eurest", "title": "Teva Runcorn", "reference": "150574-280-1", "status": "install_booked",
      "note": "Connecting screen to internet and setting up Linney Screens account + Training required",
      "sites": [{"site_name": "Teva Runcorn", "cost_centre": "98200001", "install_date": "2026-11-30", "install_company": "B&B", "status": "install_booked"}]
    },
    {
      "sector": "Eurest", "title": "Harrods Thatcham", "reference": "150574-278-1", "status": "install_booked",
      "note": "Delivery due 23/11. Installing 4x 50\" screens with pattressing",
      "sites": [{"site_name": "Harrods Thatcham", "cost_centre": "79035001", "install_date": "2026-11-27", "install_company": "B&B", "status": "install_booked", "screen_count": 4}]
    },
    {
      "sector": "Eurest", "title": "DHL Avonmouth", "status": "estimating",
      "note": "Survey 27/11",
      "tasks": ["Create cost sheet and visuals -> SD job brief drafted", "Order hardware", "Profile"],
      "sites": [{"site_name": "DHL Avonmouth", "cost_centre": "46604001", "install_date": "2026-12-21", "install_company": "B&B", "status": "pending"}]
    },
    {
      "sector": "BDO", "title": "BDO M Building", "status": "new", "due_date": "2027-09-01",
      "note": "Cost Enquiry",
      "sites": [{"site_name": "BDO M Building", "status": "pending"}]
    }
  ]$json$;

  importer constant text := 'Live Project Tracker import';
  p jsonb;
  s jsonb;
  t text;
  client uuid;
  sector uuid;
  dupes text := '';
  new_project uuid;
  site_idx integer;
  task_idx integer;
  total_screens integer;
begin
  -- 1. Compass must exist, migration 047 must have run, and nothing may
  --    already be imported.
  select id into client from clients where lower(name) = lower(client_name);
  if client is null then
    raise exception 'No client called "%" found. Nothing was imported.', client_name;
  end if;
  if to_regclass('public.client_sectors') is null then
    raise exception 'Run migration 047_client_sectors.sql first. Nothing was imported.';
  end if;

  for p in select * from jsonb_array_elements(data) loop
    if exists (
      select 1 from projects
      where client_id = client and lower(title) = lower(p ->> 'title') and archived_at is null
    ) then
      dupes := dupes || E'\n  ' || (p ->> 'title');
    end if;
  end loop;
  if dupes <> '' then
    raise exception E'These Compass projects already exist — remove them from the data list (or archive the old ones) and re-run. Nothing was imported.%', dupes;
  end if;

  -- 2. Create any sectors Compass doesn't have yet.
  insert into client_sectors (client_id, name)
  select distinct client, x ->> 'sector'
  from jsonb_array_elements(data) x
  where not exists (
    select 1 from client_sectors existing
    where existing.client_id = client and lower(trim(existing.name)) = lower(trim(x ->> 'sector'))
  );

  -- 3. Create everything.
  for p in select * from jsonb_array_elements(data) loop
    select id into sector from client_sectors
    where client_id = client and lower(trim(name)) = lower(trim(p ->> 'sector'));

    select sum((x ->> 'screen_count')::integer) into total_screens
    from jsonb_array_elements(p -> 'sites') x where x ? 'screen_count';

    insert into projects (
      client_id, sector_id, title, reference, site_location, description,
      status, priority, due_date, screen_count, source, last_activity_at
    ) values (
      client,
      sector,
      p ->> 'title',
      nullif(trim(p ->> 'reference'), ''),
      (select string_agg(x ->> 'site_name', ', ' order by o) from jsonb_array_elements(p -> 'sites') with ordinality as q(x, o)),
      'Imported from the Live Project Tracker spreadsheet on 24/11/2026.',
      p ->> 'status',
      'normal',
      nullif(p ->> 'due_date', '')::date,
      total_screens,
      'manual',
      now()
    )
    returning id into new_project;

    site_idx := 0;
    task_idx := 0;
    for s in select * from jsonb_array_elements(p -> 'sites') loop
      insert into project_sites (
        project_id, position, site_name, cost_centre, screen_count, notes,
        rams_required, status, install_date, install_company
      ) values (
        new_project, site_idx,
        s ->> 'site_name',
        nullif(s ->> 'cost_centre', ''),
        (s ->> 'screen_count')::integer,
        nullif(concat_ws(E'\n',
          case when s ? 'job_no' then 'Job No. ' || (s ->> 'job_no') end,
          s ->> 'notes'), ''),
        (s ->> 'rams_required')::boolean,
        s ->> 'status',
        nullif(s ->> 'install_date', '')::date,
        nullif(s ->> 'install_company', '')
      );
      site_idx := site_idx + 1;

      -- Site-level to-dos become project tasks named for the site.
      for t in select * from jsonb_array_elements_text(coalesce(s -> 'tasks', '[]'::jsonb)) loop
        insert into project_tasks (project_id, title, position)
        values (new_project, regexp_replace(s ->> 'site_name', '^' || (p ->> 'title') || ' ', '') || ' — ' || t, task_idx);
        task_idx := task_idx + 1;
      end loop;
    end loop;

    for t in select * from jsonb_array_elements_text(coalesce(p -> 'tasks', '[]'::jsonb)) loop
      insert into project_tasks (project_id, title, position) values (new_project, t, task_idx);
      task_idx := task_idx + 1;
    end loop;

    if coalesce(p ->> 'note', '') <> '' then
      insert into project_notes (project_id, author_name, body)
      values (new_project, importer, p ->> 'note');
    end if;

    insert into project_activity (project_id, actor_name, action, detail)
    values (new_project, importer, 'Project imported',
            site_idx || ' site(s) from the Live Project Tracker spreadsheet');
  end loop;

  raise notice 'Imported % projects.', jsonb_array_length(data);
end;
$$;

-- What was created:
select c.name as client, cs.name as sector, p.title, p.reference, p.status, p.install_date, p.install_company,
       (select count(*) from project_sites s where s.project_id = p.id) as sites,
       (select count(*) from project_tasks t where t.project_id = p.id) as tasks
from projects p
join clients c on c.id = p.client_id
left join client_sectors cs on cs.id = p.sector_id
where p.description = 'Imported from the Live Project Tracker spreadsheet on 24/11/2026.'
order by cs.name, p.title;
