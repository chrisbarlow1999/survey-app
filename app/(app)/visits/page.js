import { createClient } from '../../../lib/supabaseServer';
import { computeStats } from '../../../lib/stats';
import { StatsStrip } from '../../../components/StatsStrip';
import { ExportCsvButton } from '../../../components/ExportCsvButton';
import { Pagination } from '../../../components/Pagination';
import { PAGE_SIZE, SORT_OPTIONS, resolveSort, parsePage } from '../../../lib/listQuery';
import { formatDate, formatDateTime } from '../../../lib/formatDate';
import { ArchiveFilter, applyArchiveFilter } from '../../../components/ArchiveFilter';

export const dynamic = 'force-dynamic';

export default async function VisitsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const q = (params.q || '').trim();
  const clientId = params.client || '';
  const from = params.from || '';
  const to = params.to || '';
  const archived = params.archived || '';
  const sort = resolveSort(params.sort, 'visit_date');
  const page = parsePage(params.page);
  const hasFilters = Boolean(q || clientId || from || to || archived || params.sort);

  const supabase = await createClient();

  let query = supabase
    .from('visits')
    .select(
      'id, site_location, engineer_first, engineer_last, visit_date, submitted_at, issues, archived_at, client_id, clients(id, name)',
      { count: 'exact' }
    );

  query = applyArchiveFilter(query, archived);
  if (clientId) query = query.eq('client_id', clientId);
  if (from) query = query.gte('visit_date', from);
  if (to) query = query.lte('visit_date', to);
  if (q) {
    const safeQ = q.replace(/[",()]/g, '');
    query = query.or(
      `site_location.ilike."%${safeQ}%",engineer_first.ilike."%${safeQ}%",engineer_last.ilike."%${safeQ}%"`
    );
  }
  query = query
    .order(sort.column, { ascending: sort.ascending })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [{ data: visits, error, count }, { data: clients }, { data: statsRows }] = await Promise.all([
    query,
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('visits').select('submitted_at, clients(name)').is('archived_at', null),
  ]);

  const stats = computeStats(statsRows || []);
  const total = count || 0;

  return (
    <main>
      <StatsStrip total={stats.total} thisMonth={stats.thisMonth} clientStats={stats.clientStats} totalLabel="Total Visits" monthLabel="This Month" />

      <div className="panel" style={{ padding: '16px' }}>
        <form className="filter-row" method="get">
          <input type="text" name="q" placeholder="Search site or engineer…" defaultValue={q} />
          <select name="client" defaultValue={clientId}>
            <option value="">All Clients</option>
            {(clients || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input type="date" name="from" defaultValue={from} title="From date" />
          <input type="date" name="to" defaultValue={to} title="To date" />
          <select name="sort" defaultValue={sort.value} title="Sort by">
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ArchiveFilter value={archived} />
          <button className="btn btn-primary" type="submit">Filter</button>
          {hasFilters && <a className="btn btn-ghost" href="/visits">Clear</a>}
        </form>
      </div>

      <div className="panel" style={{ padding: '12px 16px' }}>
        <div className="toolbar" style={{ margin: '0 0 10px' }}>
          <ExportCsvButton kind="visits" filters={{ q, clientId, from, to, archived }} />
        </div>
        {error && <p className="error-text">Could not load visits: {error.message}</p>}
        {!error && (!visits || visits.length === 0) && (
          <div className="empty-state">
            {archived === '1'
              ? 'No archived visits.'
              : hasFilters
                ? 'No visits match your filters.'
                : 'No engineer visits submitted yet, or none are visible to your account.'}
          </div>
        )}
        {visits && visits.map((v) => (
          <a className="sub-row" key={v.id} href={`/visits/${v.id}`}>
            <div>
              <div className="site">
                {v.site_location || 'Untitled site'}
                {v.clients?.name ? <span className="client-badge">{v.clients.name}</span> : null}
                {v.archived_at ? <span className="client-badge archived-badge">Archived</span> : null}
              </div>
              <div className="meta">{v.engineer_first} {v.engineer_last} · {formatDate(v.visit_date)} · {formatDateTime(v.submitted_at)}</div>
            </div>
            <div className="count">{(v.issues || []).length} issue{(v.issues || []).length !== 1 ? 's' : ''}</div>
          </a>
        ))}
        <Pagination basePath="/visits" params={params} page={page} pageSize={PAGE_SIZE} total={total} />
      </div>
    </main>
  );
}
