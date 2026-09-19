import { createClient } from '../../../lib/supabaseServer';
import { formatDate } from '../../../lib/formatDate';
import { CreateMenuVenueForm } from '../../../components/menus/CreateMenuVenueForm';

export const dynamic = 'force-dynamic';

// Every venue whose outlet menus we manage. A venue is one stadium: its own
// product list, outlets and menu sets.
export default async function MenusPage({ searchParams }) {
  const params = (await searchParams) || {};
  const showArchived = params.archived === '1';
  const supabase = await createClient();

  let query = supabase
    .from('menu_venues')
    .select('id, name, created_at, archived_at, client_id, clients(name), menu_outlets(count), menu_products(count), menu_sets(count)')
    .order('name', { ascending: true });
  query = showArchived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);

  // A second, unfiltered read: a copy can start from any current venue, even
  // when this page is showing the archived ones.
  const [{ data: venues, error }, { data: clients }, { data: sourceVenues }] = await Promise.all([
    query,
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase
      .from('menu_venues')
      .select('id, name, client_id, clients(name), menu_products(count), menu_sets(count), menu_outlets(count)')
      .is('archived_at', null)
      .order('name', { ascending: true }),
  ]);

  // Every client we hold a venue for has a product catalogue worth reaching.
  const catalogueClients = [];
  for (const v of sourceVenues || []) {
    const found = catalogueClients.find((c) => c.id === v.client_id);
    if (found) found.venues.push(v.name);
    else catalogueClients.push({ id: v.client_id, name: v.clients?.name || 'Client', venues: [v.name] });
  }

  return (
    <main>
      <div className="panel" style={{ padding: '16px' }}>
        <h2>Menus</h2>
        <p className="hint">
          What every outlet sells, per menu set. Tick the ranges once and the schedules can be
          worked out from them instead of compared across spreadsheets.
        </p>
        <CreateMenuVenueForm clients={clients || []} venues={sourceVenues || []} />
      </div>

      {catalogueClients.length > 0 && (
        <div className="panel" style={{ padding: '12px 16px' }}>
          <h3 style={{ fontSize: 15, margin: '0 0 2px' }}>Product catalogues</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            What each client sells across their venues. Set one up once and their next venue starts
            from it instead of from a blank list.
          </p>
          {catalogueClients.map((c) => (
            <a className="sub-row" key={c.id} href={`/menus/catalogue/${c.id}`}>
              <div>
                <div className="site">{c.name}</div>
                <div className="meta">{c.venues.length} {c.venues.length === 1 ? 'venue' : 'venues'} · {c.venues.join(', ')}</div>
              </div>
            </a>
          ))}
        </div>
      )}

      <div className="panel" style={{ padding: '12px 16px' }}>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <a className="btn btn-ghost" href={showArchived ? '/menus' : '/menus?archived=1'}>
            {showArchived ? 'Show current venues' : 'Show archived venues'}
          </a>
        </div>
        {error && (
          <p className="error-text">
            Could not load venues: {error.message}
            {/menu_venues/.test(error.message) ? ' — has supabase/037_menus.sql been run?' : ''}
          </p>
        )}
        {!error && (!venues || venues.length === 0) && (
          <div className="empty-state">
            {showArchived ? 'No archived venues.' : 'No venues yet. Add one above, then import the client’s range sheet into it.'}
          </div>
        )}
        {(venues || []).map((v) => (
          <a className="sub-row" key={v.id} href={`/menus/${v.id}`}>
            <div>
              <div className="site">
                {v.name}
                {v.clients?.name ? <span className="client-badge">{v.clients.name}</span> : null}
                {v.archived_at ? <span className="client-badge archived-badge">Archived</span> : null}
              </div>
              <div className="meta">
                {v.menu_outlets?.[0]?.count ?? 0} outlets · {v.menu_products?.[0]?.count ?? 0} products ·{' '}
                {v.menu_sets?.[0]?.count ?? 0} menu sets · added {formatDate(v.created_at)}
              </div>
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}
