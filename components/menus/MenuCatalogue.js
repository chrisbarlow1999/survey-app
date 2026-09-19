'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';
import { InlineText } from './MenuProducts';

// One client's product library, shared by every venue we run for them. A venue
// takes copies from here; changing a line here does NOT change the venues that
// already took it — their prices are their own. "At N venues" says how many
// took it, so a price that's drifted everywhere is at least visible.
export function MenuCatalogue({ clientId, products, sectionNames }) {
  const supabase = createClient();
  const router = useRouter();
  const [error, setError] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState({ section: sectionNames[0] || '', name: '', detail: '', price: '' });

  async function run(promise, message) {
    setError('');
    const { error: err } = await promise;
    if (err) {
      setError(`${message}: ${err.message}`);
      return false;
    }
    router.refresh();
    return true;
  }

  async function add(e) {
    e.preventDefault();
    const section = adding.section.trim();
    const name = adding.name.trim();
    if (!section || !name) {
      setError('A catalogue product needs a section and a name.');
      return;
    }
    const ok = await run(
      supabase.from('menu_catalogue_products').insert({
        client_id: clientId,
        section_name: section,
        name,
        detail: adding.detail.trim() || null,
        price: adding.price.trim() || null,
        position: products.length,
      }),
      'Could not add that product'
    );
    if (ok) setAdding({ section, name: '', detail: '', price: '' });
  }

  const shown = products.filter((p) => showArchived || !p.archived_at);
  const bySection = new Map();
  for (const p of shown) {
    const key = p.section_name.trim();
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(p);
  }
  const archivedCount = products.filter((p) => p.archived_at).length;

  return (
    <div className="panel" style={{ padding: '12px 16px' }}>
      <form className="filter-row" onSubmit={add} style={{ marginTop: 0 }}>
        <input
          list="catalogue-sections"
          placeholder="Section, e.g. BOTTLES & CANS"
          value={adding.section}
          onChange={(e) => setAdding({ ...adding, section: e.target.value })}
          aria-label="Section"
        />
        <datalist id="catalogue-sections">
          {sectionNames.map((s) => <option key={s} value={s} />)}
        </datalist>
        <input
          placeholder="Product name"
          value={adding.name}
          onChange={(e) => setAdding({ ...adding, name: e.target.value })}
          aria-label="Product name"
        />
        <input
          placeholder="Detail, e.g. 4.6% ABV | 440ml"
          value={adding.detail}
          onChange={(e) => setAdding({ ...adding, detail: e.target.value })}
          aria-label="Detail"
        />
        <input
          placeholder="List price"
          value={adding.price}
          onChange={(e) => setAdding({ ...adding, price: e.target.value })}
          aria-label="List price"
        />
        <button className="btn btn-primary" type="submit">Add to catalogue</button>
        {archivedCount > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide' : 'Show'} {archivedCount} archived
          </button>
        )}
      </form>
      {error && <p className="error-text">{error}</p>}

      {products.length === 0 && (
        <div className="empty-state">
          Nothing in this catalogue yet. Add a product above, or open a venue that already has its
          products and use <strong>Send to catalogue</strong> on its Products tab.
        </div>
      )}

      {[...bySection.entries()].map(([section, rows]) => (
        <div key={section} className="menu-section-block">
          <div className="menu-section-head">
            <span className="menu-section-name">{section}</span>
          </div>
          <table className="data-table menu-product-table">
            <thead>
              <tr><th>Product</th><th>Detail</th><th>List price (£)</th><th>Used at</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={p.archived_at ? 'table-muted' : ''}>
                  <td>
                    <InlineText value={p.name} label="Product name" required
                      onSave={(v) => run(supabase.from('menu_catalogue_products').update({ name: v }).eq('id', p.id), 'Could not save')} />
                  </td>
                  <td>
                    <InlineText value={p.detail} label="Detail" placeholder="ABV, size, description"
                      onSave={(v) => run(supabase.from('menu_catalogue_products').update({ detail: v || null }).eq('id', p.id), 'Could not save')} />
                  </td>
                  <td>
                    <InlineText value={p.price} label="List price" placeholder="e.g. 6.60 | 3.30"
                      onSave={(v) => run(supabase.from('menu_catalogue_products').update({ price: v || null }).eq('id', p.id), 'Could not save')} />
                  </td>
                  <td className="meta">
                    {(() => {
                      const n = p.menu_products?.[0]?.count ?? 0;
                      return `${n} ${n === 1 ? 'venue' : 'venues'}`;
                    })()}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => run(
                        supabase.from('menu_catalogue_products')
                          .update({ archived_at: p.archived_at ? null : new Date().toISOString() })
                          .eq('id', p.id),
                        'Could not change that product'
                      )}
                    >
                      {p.archived_at ? 'Restore' : 'Archive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
