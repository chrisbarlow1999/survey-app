import { createClient } from '../../../lib/supabaseServer';
import { computeStats } from '../../../lib/stats';
import { StatsStrip } from '../../../components/StatsStrip';

export const dynamic = 'force-dynamic';

export default async function InstallationsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const q = (params.q || '').trim();
  const clientId = params.client || '';
  const from = params.from || '';
  const to = params.to || '';
  const hasFilters = Boolean(q || clientId || from || to);

  const supabase = await createClient();

  let query = supabase
    .from('installations')
    .select('id, site_location, engineer_first, engineer_last, install_date, submitted_at, locations, client_id, clients(id, name)')
    .order('submitted_at', { ascending: false });

  if (clientId) query = query.eq('client_id', clientId);
  if (from) query = query.gte('install_date', from);
  if (to) query = query.lte('install_date', to);
  if (q) {
    const safeQ = q.replace(/[",()]/g, '');
    query = query.or(
      `site_location.ilike."%${safeQ}%",engineer_first.ilike."%${safeQ}%",engineer_last.ilike."%${safeQ}%"`
    );
  }

  const [{ data: installations, error }, { data: clients }, { data: statsRows }] = await Promise.all([
    query,
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('installations').select('submitted_at, clients(name)'),
  ]);

  const stats = computeStats(statsRows || []);

  return (
    <main>
      <StatsStrip total={stats.total} thisMonth={stats.thisMonth} clientStats={stats.clientStats} totalLabel="Total Installations" monthLabel="This Month" />

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
          <button className="btn btn-primary" type="submit">Filter</button>
          {hasFilters && <a className="btn btn-ghost" href="/installations">Clear</a>}
        </form>
      </div>

      <div className="panel" style={{ padding: '12px 16px' }}>
        {error && <p className="error-text">Could not load installations: {error.message}</p>}
        {!error && (!installations || installations.length === 0) && (
          <div className="empty-state">{hasFilters ? 'No installations match your filters.' : 'No install confirmations submitted yet, or none are visible to your account.'}</div>
        )}
        {installations && installations.map((s) => (
          <a className="sub-row" key={s.id} href={`/installations/${s.id}`}>
            <div>
              <div className="site">{s.site_location || 'Untitled site'}{s.clients?.name ? <span className="client-badge">{s.clients.name}</span> : null}</div>
              <div className="meta">{s.engineer_first} {s.engineer_last} · {s.install_date} · {new Date(s.submitted_at).toLocaleString()}</div>
            </div>
            <div className="count">{(s.locations || []).length} screen{(s.locations || []).length !== 1 ? 's' : ''}</div>
          </a>
        ))}
      </div>
    </main>
  );
}
