import { createClient } from '../../lib/supabaseServer';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }) {
  const params = (await searchParams) || {};
  const q = (params.q || '').trim();
  const clientId = params.client || '';
  const from = params.from || '';
  const to = params.to || '';
  const hasFilters = Boolean(q || clientId || from || to);

  const supabase = await createClient();

  let query = supabase
    .from('surveys')
    .select('id, site_location, engineer_first, engineer_last, survey_date, submitted_at, locations, client_id, clients(id, name)')
    .order('submitted_at', { ascending: false });

  if (clientId) query = query.eq('client_id', clientId);
  if (from) query = query.gte('survey_date', from);
  if (to) query = query.lte('survey_date', to);
  if (q) {
    const safeQ = q.replace(/[",()]/g, '');
    query = query.or(
      `site_location.ilike."%${safeQ}%",engineer_first.ilike."%${safeQ}%",engineer_last.ilike."%${safeQ}%"`
    );
  }

  const [{ data: surveys, error }, { data: clients }] = await Promise.all([
    query,
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
  ]);

  return (
    <main>
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
          {hasFilters && <a className="btn btn-ghost" href="/dashboard">Clear</a>}
        </form>
      </div>

      <div className="panel" style={{ padding: '12px 16px' }}>
        {error && <p className="error-text">Could not load surveys: {error.message}</p>}
        {!error && (!surveys || surveys.length === 0) && (
          <div className="empty-state">{hasFilters ? 'No surveys match your filters.' : 'No surveys submitted yet, or none are visible to your account.'}</div>
        )}
        {surveys && surveys.map((s) => (
          <a className="sub-row" key={s.id} href={`/dashboard/${s.id}`}>
            <div>
              <div className="site">{s.site_location || 'Untitled site'}{s.clients?.name ? <span className="client-badge">{s.clients.name}</span> : null}</div>
              <div className="meta">{s.engineer_first} {s.engineer_last} · {s.survey_date} · {new Date(s.submitted_at).toLocaleString()}</div>
            </div>
            <div className="count">{(s.locations || []).length} location{(s.locations || []).length !== 1 ? 's' : ''}</div>
          </a>
        ))}
      </div>
    </main>
  );
}
