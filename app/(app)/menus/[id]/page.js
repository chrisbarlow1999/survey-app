import { createClient } from '../../../../lib/supabaseServer';
import { ArchiveButton } from '../../../../components/ArchiveButton';
import { MenuGrid } from '../../../../components/menus/MenuGrid';
import { MenuGroups } from '../../../../components/menus/MenuGroups';
import { MenuProducts } from '../../../../components/menus/MenuProducts';
import { MenuOutlets } from '../../../../components/menus/MenuOutlets';
import { MenuImport } from '../../../../components/menus/MenuImport';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'grid', label: 'Ranges' },
  { key: 'groups', label: 'Groups' },
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

  const [sectionsRes, productsRes, outletsRes, setsRes, rangesRes] = await Promise.all([
    supabase.from('menu_sections').select('id, name, position').eq('venue_id', id).order('position').order('name'),
    supabase.from('menu_products')
      .select('id, section_id, name, detail, price, tier_note, position, archived_at')
      .eq('venue_id', id).order('position').order('name'),
    supabase.from('menu_outlets')
      .select('id, name, store_code, menu_tier, menu_type, landscape_screens, portrait_screens, client_screens, current_schedule, notes, position, archived_at')
      .eq('venue_id', id).order('position').order('name'),
    supabase.from('menu_sets').select('id, name, position').eq('venue_id', id).order('position').order('created_at'),
    fetchAllRanges(supabase, id),
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
      {tab === 'products' && (
        <MenuProducts venueId={id} sections={sections} products={allProducts} />
      )}
      {tab === 'outlets' && <MenuOutlets outlets={allOutlets} />}
      {tab === 'import' && (
        <MenuImport
          venueId={id}
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
