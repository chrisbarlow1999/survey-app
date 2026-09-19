import { createClient } from '../../../../../lib/supabaseServer';
import { MenuCatalogue } from '../../../../../components/menus/MenuCatalogue';

export const dynamic = 'force-dynamic';

// A client's product library, shared across their venues. Setting up their
// next stadium starts from here instead of from a blank list.
export default async function MenuCataloguePage({ params }) {
  const { clientId } = await params;
  const supabase = await createClient();

  const [{ data: client }, { data: products, error }, { data: venues }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', clientId).single(),
    supabase
      .from('menu_catalogue_products')
      .select('id, section_name, name, detail, price, tier_note, position, archived_at, menu_products(count)')
      .eq('client_id', clientId)
      .order('position')
      .order('name'),
    supabase.from('menu_venues').select('id, name').eq('client_id', clientId).is('archived_at', null).order('name'),
  ]);

  if (!client) {
    return (
      <main>
        <a className="back-link" href="/menus">&larr; Back to Menus</a>
        <div className="empty-state">Client not found, or you don&apos;t have access to it.</div>
      </main>
    );
  }

  const rows = products || [];
  const sectionNames = [...new Set(rows.map((p) => p.section_name.trim()))];

  return (
    <main className="project-main">
      <a className="back-link" href="/menus">&larr; Back to Menus</a>

      <div className="panel">
        <h2 style={{ fontSize: 20 }}>
          Product catalogue
          <span className="client-badge" style={{ marginLeft: 10, verticalAlign: 'middle' }}>{client.name}</span>
        </h2>
        <p className="hint">
          Everything {client.name} sells across their venues. A venue takes a copy, with its own price
          and its own ticks — editing a line here doesn&apos;t change the venues that already took it.
        </p>
        <div className="kv-grid">
          <div className="kv"><div className="k">Products</div><div className="v">{rows.filter((p) => !p.archived_at).length}</div></div>
          <div className="kv"><div className="k">Sections</div><div className="v">{sectionNames.length}</div></div>
          <div className="kv">
            <div className="k">Venues</div>
            <div className="v">
              {(venues || []).length === 0
                ? '—'
                : (venues || []).map((v, i) => (
                  <span key={v.id}>
                    {i > 0 ? ', ' : ''}
                    <a href={`/menus/${v.id}`}>{v.name}</a>
                  </span>
                ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="error-text">
          Could not load the catalogue: {error.message}
          {/menu_catalogue_products/.test(error.message) ? ' — has supabase/038_menu_catalogue.sql been run?' : ''}
        </p>
      )}

      {!error && <MenuCatalogue clientId={clientId} products={rows} sectionNames={sectionNames} />}
    </main>
  );
}
