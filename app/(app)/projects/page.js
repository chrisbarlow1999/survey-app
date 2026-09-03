import { createClient } from '../../../lib/supabaseServer';
import { Pagination } from '../../../components/Pagination';
import { PAGE_SIZE, PROJECT_SORT_OPTIONS, resolveProjectSort, parsePage } from '../../../lib/listQuery';
import { formatDate } from '../../../lib/formatDate';
import { ArchiveFilter, applyArchiveFilter } from '../../../components/ArchiveFilter';
import { PROJECT_STATUSES, statusLabel, statusTone, isClosed } from '../../../lib/projectStatus';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const q = (params.q || '').trim();
  const clientId = params.client || '';
  const status = params.status || '';
  const archived = params.archived || '';
  const sort = resolveProjectSort(params.sort);
  const page = parsePage(params.page);
  const hasFilters = Boolean(q || clientId || status || archived || params.sort);

  const supabase = await createClient();

  let query = supabase
    .from('projects')
    .select(
      'id, title, reference, site_location, status, priority, due_date, source, created_at, archived_at, client_id, clients(id, name)',
      { count: 'exact' }
    );

  query = applyArchiveFilter(query, archived);
  if (clientId) query = query.eq('client_id', clientId);
  if (status) query = query.eq('status', status);
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
  const [{ data: projects, error, count }, { data: clients }, { data: statsRows }, { data: openTasks }] = await Promise.all([
    query,
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('projects').select('status, clients(name)').is('archived_at', null),
    supabase.from('project_tasks').select('id').is('completed_at', null),
  ]);

  const allOpen = (statsRows || []).filter((r) => !isClosed(r.status));
  const byClient = {};
  allOpen.forEach((r) => {
    const name = r.clients?.name || 'Unassigned';
    byClient[name] = (byClient[name] || 0) + 1;
  });
  const clientStats = Object.entries(byClient).sort((a, b) => b[1] - a[1]);
  const total = count || 0;

  return (
    <main>
      <div className="stats-strip">
        <div className="stat-tile">
          <div className="stat-value">{allOpen.length}</div>
          <div className="stat-label">Open Projects</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{(openTasks || []).length}</div>
          <div className="stat-label">Open Tasks</div>
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

      <div className="panel" style={{ padding: '16px' }}>
        <form className="filter-row" method="get">
          <input type="text" name="q" placeholder="Search title, reference or site…" defaultValue={q} />
          <select name="client" defaultValue={clientId}>
            <option value="">All Clients</option>
            {(clients || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select name="status" defaultValue={status}>
            <option value="">All Statuses</option>
            {PROJECT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select name="sort" defaultValue={sort.value} title="Sort by">
            {PROJECT_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ArchiveFilter value={archived} />
          <button className="btn btn-primary" type="submit">Filter</button>
          {hasFilters && <a className="btn btn-ghost" href="/projects">Clear</a>}
        </form>
      </div>

      <div className="panel" style={{ padding: '12px 16px' }}>
        <div className="toolbar" style={{ margin: '0 0 10px' }}>
          <a className="btn btn-primary" href="/projects/new">+ New Project</a>
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
          <a className="sub-row" key={p.id} href={`/projects/${p.id}`}>
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
