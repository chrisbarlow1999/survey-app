import { createClient } from '../../../lib/supabaseServer';
import { Pagination } from '../../../components/Pagination';
import { PAGE_SIZE, resolveProjectSort, parsePage } from '../../../lib/listQuery';
import { formatDate } from '../../../lib/formatDate';
import { applyArchiveFilter } from '../../../components/ArchiveFilter';
import { statusLabel, statusTone, isClosed } from '../../../lib/projectStatus';
import { ProjectFilters } from '../../../components/ProjectFilters';
import { projectHref } from '../../../lib/projectBackLink';
import { ProjectViewTabs } from '../../../components/ProjectViewTabs';
import { ExportCsvButton } from '../../../components/ExportCsvButton';
import { screenTotals, screenLabel } from '../../../lib/screenCount';
import { valueTotals, formatGBPShort } from '../../../lib/money';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage({ searchParams }) {
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
      'id, title, reference, site_location, status, priority, due_date, install_date, source, created_at, archived_at, client_id, screen_count, value_gbp, clients(id, name), owner:profiles!owner_id(id, full_name, email)',
      { count: 'exact' }
    );

  query = applyArchiveFilter(query, archived);
  if (clientId) query = query.eq('client_id', clientId);
  if (status) query = query.eq('status', status);
  // 'none' is a real filter, not an empty one — "what has nobody picked up?"
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

  // The stats row deliberately counts open work rather than "this month" — a
  // project list is about what's outstanding, not throughput.
  const [{ data: projects, error, count }, { data: clients }, { data: statsRows }, { data: openTasks }, { data: owners }] = await Promise.all([
    query,
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('projects').select('status, screen_count, value_gbp, clients(name)').is('archived_at', null),
    supabase.from('project_tasks').select('id').is('completed_at', null),
    supabase.from('profiles').select('id, full_name, email').in('role', ['user', 'super_admin']).eq('active', true).order('full_name', { ascending: true }),
  ]);

  const allOpen = (statsRows || []).filter((r) => !isClosed(r.status));
  const byClient = {};
  allOpen.forEach((r) => {
    const name = r.clients?.name || 'Unassigned';
    byClient[name] = (byClient[name] || 0) + 1;
  });
  const clientStats = Object.entries(byClient).sort((a, b) => b[1] - a[1]);
  // Across open projects only, matching the Open Projects tile beside it — a
  // pipeline figure that quietly included completed work would be nonsense.
  const screens = screenTotals(allOpen);
  const value = valueTotals(allOpen);
  const total = count || 0;

  return (
    <main className="project-main">
      <ProjectViewTabs current="list" params={params} />

      <div className="stats-strip">
        <div className="stat-tile">
          <div className="stat-value">{allOpen.length}</div>
          <div className="stat-label">Open Projects</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{(openTasks || []).length}</div>
          <div className="stat-label">Open Tasks</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{screens.total}</div>
          <div className="stat-label">Screens In Pipeline</div>
          {screens.unestimated > 0 && (
            <div className="stat-note">{screens.unestimated} not estimated</div>
          )}
        </div>
        <div className="stat-tile">
          <div className="stat-value">{formatGBPShort(value.total)}</div>
          <div className="stat-label">Pipeline Value</div>
          {value.unquoted > 0 && (
            <div className="stat-note">{value.unquoted} not quoted</div>
          )}
        </div>
        {clientStats.length > 0 && (
          <div className="stat-tile stat-tile-clients">
            <div className="stat-label">Open By Client</div>
            <div className="stat-client-list">
              {clientStats.map(([name, n]) => (
                <span key={name} className="stat-client-badge">{name} · {n}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <ProjectFilters params={params} clients={clients} owners={owners} basePath="/projects" />

      <div className="panel" style={{ padding: '12px 16px' }}>
        <div className="toolbar" style={{ margin: '0 0 10px' }}>
          <a className="btn btn-primary" href="/projects/new">+ New Project</a>
          <ExportCsvButton kind="projects" filters={{ q, clientId, status, owner, archived }} />
        </div>
        {error && <p className="error-text">Could not load projects: {error.message}</p>}
        {!error && (!projects || projects.length === 0) && (
          <div className="empty-state">
            {archived === '1'
              ? 'No archived projects.'
              : hasFilters
                ? 'No projects match your filters.'
                : 'No projects yet. Create one, or share a client’s request link so they can raise one.'}
          </div>
        )}
        {projects && projects.map((p) => (
          <a className="sub-row" key={p.id} href={projectHref(p.id, '/projects', params)}>
            <div>
              <div className="site">
                {p.title}
                {p.clients?.name ? <span className="client-badge">{p.clients.name}</span> : null}
                {p.source === 'intake' ? <span className="client-badge intake-badge">Request</span> : null}
                {p.archived_at ? <span className="client-badge archived-badge">Archived</span> : null}
              </div>
              <div className="meta">
                {p.reference ? `${p.reference} · ` : ''}
                {p.site_location || 'No site set'}
                {p.screen_count != null ? ` · ${screenLabel(p.screen_count)}` : ''}
                {` · ${p.owner?.full_name || p.owner?.email || 'Unassigned'}`}
                {p.install_date ? ` · Install ${formatDate(p.install_date)}` : ''}
                {p.due_date ? ` · Due ${formatDate(p.due_date)}` : ''}
              </div>
            </div>
            <div className="count">
              <span className={`status-pill status-${statusTone(p.status)}`}>{statusLabel(p.status)}</span>
            </div>
          </a>
        ))}
        <Pagination basePath="/projects" params={params} page={page} pageSize={PAGE_SIZE} total={total} />
      </div>
    </main>
  );
}
