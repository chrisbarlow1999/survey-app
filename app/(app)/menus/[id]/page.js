import { createClient } from '../../../../lib/supabaseServer';
import { ArchiveButton } from '../../../../components/ArchiveButton';
import { MenuGrid } from '../../../../components/menus/MenuGrid';
import { MenuGroups } from '../../../../components/menus/MenuGroups';
import { MenuProducts } from '../../../../components/menus/MenuProducts';
import { MenuOutlets } from '../../../../components/menus/MenuOutlets';
import { MenuImport } from '../../../../components/menus/MenuImport';
import { MenuChanges } from '../../../../components/menus/MenuChanges';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'grid', label: 'Ranges' },
  { key: 'groups', label: 'Groups' },
  { key: 'changes', label: 'Changes' },
  { key: 'products', label: 'Products' },
  { key: 'outlets', label: 'Outlets' },
  { key: 'import', label: 'Import' },
];

// PostgREST hands back at most 1,000 rows a request. A stadium is ~100 outlets
// × ~50 products per set, so ranges routinely go past that and have to be paged.
async function fetchAllRanges(supabase, venueId) {
  const rows = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from('menu_ranges')
      .select('menu_set_id, outlet_id, product_id')
      .eq('venue_id', venueId)
      .order('menu_set_id').order('outlet_id').order('product_id')
      .range(from, from + size - 1);
    if (error) return { rows, error };
    rows.push(...data);
    if (data.length < size) return { rows, error: null };
  }
}

export default async function MenuVenuePage({ params, searchParams }) {
  const { id } = await params;
  const query = (await searchParams) || {};
  const tab = TABS.some((t) => t.key === query.tab) ? query.tab : 'grid';

  const supabase = await createClient();
  const { data: venue, error } = await supabase
    .from('menu_venues')
    .select('id, name, notes, archived_at, client_id, clients(name)')
    .eq('id', id)
    .single();

  if (error || !venue) {
    return (
      <main>
        <a className="back-link" href="/menus">&larr; Back to Menus</a>
        <div className="empty-state">Venue not found, or you don&apos;t have access to it.</div>
      </main>
    );
  }

  const [sectionsRes, productsRes, outletsRes, setsRes, rangesRes, catalogueRes, profilesRes, requestsRes] = await Promise.all([
    supabase.from('menu_sections').select('id, name, position').eq('venue_id', id).order('position').order('name'),
    supabase.from('menu_products')
      .select('id, section_id, name, detail, price, tier_note, position, archived_at, catalogue_id')
      .eq('venue_id', id).order('position').order('name'),
    supabase.from('menu_outlets')
      .select('id, name, store_code, menu_tier, menu_type, landscape_screens, portrait_screens, client_screens, current_schedule, notes, position, archived_at')
      .eq('venue_id', id).order('position').order('name'),
    supabase.from('menu_sets').select('id, name, position').eq('venue_id', id).order('position').order('created_at'),
    fetchAllRanges(supabase, id),
    // The client's catalogue. Missing until 038 is run, so its error is kept
    // out of the page-level one: the rest of the venue still works without it.
    supabase.from('menu_catalogue_products')
      .select('id, section_name, name, detail, price, archived_at')
      .eq('client_id', venue.client_id).order('position').order('name'),
    // Saved spreadsheet layouts for this client. Missing until 039 is run; the
    // import screen just works the layout out from the sheet without them.
    supabase.from('menu_import_profiles')
      .select('id, name, sheet_hint, mapping')
      .eq('client_id', venue.client_id).order('name'),
    // Change requests with their lines. Missing until 040 is run, so the tab
    // says so rather than the whole venue failing to load.
    supabase.from('menu_change_requests')
      .select('id, title, status, menu_set_id, fixture_date, requested_by, notes, applied_at, created_at, menu_change_request_items(id, kind, product_id, product_label, section_name, detail, from_price, to_price, outlet_ids, schedule_note, position)')
      .eq('venue_id', id).order('created_at', { ascending: false }),
  ]);

  const loadError = [sectionsRes, productsRes, outletsRes, setsRes, rangesRes].find((r) => r.error)?.error;
  const sections = sectionsRes.data || [];
  const allProducts = productsRes.data || [];
  const allOutlets = outletsRes.data || [];
  const sets = setsRes.data || [];
  const ranges = rangesRes.rows || [];

  // Products are shown in section order, then their own order.
  const sectionOrder = new Map(sections.map((s, i) => [s.id, i]));
  const byDisplayOrder = (a, b) =>
    (sectionOrder.get(a.section_id) ?? 999) - (sectionOrder.get(b.section_id) ?? 999) || a.position - b.position;
  allProducts.sort(byDisplayOrder);
  const products = allProducts.filter((p) => !p.archived_at);
  const outlets = allOutlets.filter((o) => !o.archived_at);

  const setId = sets.some((s) => s.id === query.set) ? query.set : sets[0]?.id || null;
  const compareId = sets.some((s) => s.id === query.compare) && query.compare !== setId ? query.compare : null;

  const tabHref = (key) => {
    const qs = new URLSearchParams();
    if (key !== 'grid') qs.set('tab', key);
    if (setId && setId !== sets[0]?.id) qs.set('set', setId);
    const s = qs.toString();
    return `/menus/${id}${s ? `?${s}` : ''}`;
  };

  return (
    <main className="project-main">
      <a className="back-link" href="/menus">&larr; Back to Menus</a>
      <div className="toolbar">
        <ArchiveButton table="menu_venues" recordId={venue.id} archived={Boolean(venue.archived_at)} />
      </div>

      <div className="panel">
        <h2 style={{ fontSize: 20 }}>
          {venue.name}
          {venue.clients?.name ? <span className="client-badge" style={{ marginLeft: 10, verticalAlign: 'middle' }}>{venue.clients.name}</span> : null}
        </h2>
        <div className="kv-grid">
          <div className="kv"><div className="k">Outlets</div><div className="v">{outlets.length}</div></div>
          <div className="kv"><div className="k">Products</div><div className="v">{products.length}</div></div>
          <div className="kv"><div className="k">Menu sets</div><div className="v">{sets.map((s) => s.name).join(', ') || '—'}</div></div>
        </div>
      </div>

      {loadError && (
        <p className="error-text">
          Could not load all of this venue: {loadError.message}
        </p>
      )}

      <div className="view-tabs">
        {TABS.map((t) => (
          <a key={t.key} className={tab === t.key ? 'on' : ''} href={tabHref(t.key)}>{t.label}</a>
        ))}
      </div>

      {tab === 'grid' && (
        <MenuGrid
          venueId={id}
          sections={sections}
          products={products}
          outlets={outlets}
          sets={sets}
          ranges={ranges}
          setId={setId}
          compareId={compareId}
        />
      )}
      {tab === 'groups' && (
        <MenuGroups
          venueId={id}
          sections={sections}
          products={products}
          outlets={outlets}
          sets={sets}
          ranges={ranges}
          setId={setId}
        />
      )}
      {tab === 'changes' && (
        requestsRes.error ? (
          <p className="error-text">
            Could not load change requests: {requestsRes.error.message}
            {/menu_change_request/.test(requestsRes.error.message) ? ' — has supabase/040_menu_change_requests.sql been run?' : ''}
          </p>
        ) : (
          <MenuChanges
            venueId={id}
            sections={sections}
            products={products}
            outlets={outlets}
            sets={sets}
            ranges={ranges}
            defaultSetId={setId}
            requests={requestsRes.data || []}
          />
        )
      )}
      {tab === 'products' && (
        <MenuProducts
          venueId={id}
          sections={sections}
          products={allProducts}
          clientId={catalogueRes.error ? null : venue.client_id}
          clientName={venue.clients?.name || 'this client'}
          catalogue={catalogueRes.data || []}
        />
      )}
      {tab === 'outlets' && <MenuOutlets outlets={allOutlets} />}
      {tab === 'import' && (
        <MenuImport
          venueId={id}
          clientId={venue.client_id}
          clientName={venue.clients?.name || 'this client'}
          profiles={profilesRes.error ? [] : (profilesRes.data || [])}
          sections={sections}
          products={allProducts}
          outlets={allOutlets}
          sets={sets}
          ranges={ranges}
          defaultSetId={setId}
        />
      )}
    </main>
  );
}
