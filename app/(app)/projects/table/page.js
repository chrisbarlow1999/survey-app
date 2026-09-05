import { createClient } from '../../../../lib/supabaseServer';
import { Pagination } from '../../../../components/Pagination';
import { PAGE_SIZE, resolveProjectSort, parsePage } from '../../../../lib/listQuery';
import { applyArchiveFilter } from '../../../../components/ArchiveFilter';
import { isClosed } from '../../../../lib/projectStatus';
import { ProjectViewTabs } from '../../../../components/ProjectViewTabs';
import { ProjectFilters } from '../../../../components/ProjectFilters';
import { ProjectTable } from '../../../../components/ProjectTable';
import { ExportCsvButton } from '../../../../components/ExportCsvButton';
import { screenTotals } from '../../../../lib/screenCount';

export const dynamic = 'force-dynamic';

// The spreadsheet view of the pipeline. Same data and same filters as the list,
// laid out for reading across rather than down — project, screens, stage,
// install date — which is what gets asked for in a management meeting.
export default async function ProjectsTablePage({ searchParams }) {
  const params = (await searchParams) || {};
  const q = (params.q || '').trim();
  const clientId = params.client || '';
  const status = params.status || '';
  const owner = params.owner || '';
  const archived = params.archived || '';
  const sort = resolveProjectSort(params.sort);
  const page = parsePage(params.page);
  const hasFilters = Boolean(q || clientId || status || owner || archived || params.sort);

  const supabase = await createClient();

  let query = supabase
    .from('projects')
    .select(
      'id, title, reference, site_location, status, priority, due_date, install_date, screen_count, source, created_at, archived_at, client_id, clients(id, name), owner:profiles!owner_id(id, full_name, email)',
      { count: 'exact' }
    );

  query = applyArchiveFilter(query, archived);
  if (clientId) query = query.eq('client_id', clientId);
  if (status) query = query.eq('status', status);
  if (owner === 'none') query = query.is('owner_id', null);
  else if (owner) query = query.eq('owner_id', owner);
  if (q) {
    const safeQ = q.replace(/[",()]/g, '');
    query = query.or(
      `title.ilike."%${safeQ}%",reference.ilike."%${safeQ}%",site_location.ilike."%${safeQ}%"`
    );
  }
  query = query
    .order(sort.column, { ascending: sort.ascending, nullsFirst: sort.nullsFirst })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [{ data: projects, error, count }, { data: clients }, { data: owners }, { data: statsRows }] =
    await Promise.all([
      query,
      supabase.from('clients').select('id, name').order('name', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email').in('role', ['user', 'super_admin']).eq('active', true).order('full_name', { ascending: true }),
      supabase.from('projects').select('status, screen_count').is('archived_at', null),
    ]);

  // Task tallies live in another table. Fetched for the visible page in one
  // query rather than one per row — the same shape the CSV export uses.
  const rows = projects || [];
  let withTasks = rows;
  if (rows.length) {
    const { data: tasks } = await supabase
      .from('project_tasks')
      .select('project_id, completed_at')
      .in('project_id', rows.map((r) => r.id));
    const tally = {};
    (tasks || []).forEach((t) => {
      const e = tally[t.project_id] || { total: 0, done: 0 };
      e.total += 1;
      if (t.completed_at) e.done += 1;
      tally[t.project_id] = e;
    });
    withTasks = rows.map((r) => ({
      ...r,
      taskTotal: tally[r.id]?.total || 0,
      taskDone: tally[r.id]?.done || 0,
    }));
  }

  const allOpen = (statsRows || []).filter((r) => !isClosed(r.status));
  const screens = screenTotals(allOpen);
  // Screens across everything the current filters match, not just this page —
  // the number someone would actually quote in a meeting.
  const filteredScreens = screenTotals(rows);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="project-main">
      <ProjectViewTabs current="table" params={params} />

      <div className="stats-strip">
        <div className="stat-tile">
          <div className="stat-value">{count || 0}</div>
          <div className="stat-label">{hasFilters ? 'Matching Projects' : 'All Projects'}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{screens.total}</div>
          <div className="stat-label">Screens In Pipeline</div>
          {screens.unestimated > 0 && (
            <div className="stat-note">{screens.unestimated} not estimated</div>
          )}
        </div>
        <div className="stat-tile">
          <div className="stat-value">{filteredScreens.total}</div>
          <div className="stat-label">Screens On This Page</div>
        </div>
      </div>

      <ProjectFilters params={params} clients={clients} owners={owners} basePath="/projects/table" />

      <div className="panel" style={{ padding: '12px 16px' }}>
        <div className="toolbar" style={{ margin: '0 0 10px' }}>
          <a className="btn btn-primary" href="/projects/new">+ New Project</a>
          <ExportCsvButton kind="projects" filters={{ q, clientId, status, owner, archived }} />
        </div>
        {error && <p className="error-text">Could not load projects: {error.message}</p>}
        {!error && withTasks.length === 0 && (
          <div className="empty-state">
            {archived === '1'
              ? 'No archived projects.'
              : hasFilters
                ? 'No projects match your filters.'
                : 'No projects yet. Create one, or share a client’s request link so they can raise one.'}
          </div>
        )}
        {withTasks.length > 0 && (
          <ProjectTable projects={withTasks} params={params} basePath="/projects/table" today={today} />
        )}
        <Pagination basePath="/projects/table" params={params} page={page} pageSize={PAGE_SIZE} total={count || 0} />
      </div>
    </main>
  );
}
