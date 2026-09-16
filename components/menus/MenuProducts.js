'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

// The venue's one product list, grouped under the slide titles the client
// uses. Fields save when you leave them, like project fields do.
//
// Products are archived rather than deleted: a deleted product would take its
// ticks with it, and with them the record of who sold it.
export function MenuProducts({ venueId, sections, products }) {
  const supabase = createClient();
  const router = useRouter();
  const [error, setError] = useState('');
  const [newSection, setNewSection] = useState('');
  const [showArchived, setShowArchived] = useState(false);

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

  async function addSection(e) {
    e.preventDefault();
    const name = newSection.trim();
    if (!name) return;
    const ok = await run(
      supabase.from('menu_sections').insert({ venue_id: venueId, name, position: sections.length }),
      'Could not add that section'
    );
    if (ok) setNewSection('');
  }

  // Swaps positions with the neighbour. Positions are rewritten for the whole
  // list so older rows that all sit at 0 end up in a real order.
  async function moveSection(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const order = [...sections];
    [order[index], order[target]] = [order[target], order[index]];
    setError('');
    for (let i = 0; i < order.length; i++) {
      if (order[i].position === i) continue;
      const { error: err } = await supabase.from('menu_sections').update({ position: i }).eq('id', order[i].id);
      if (err) {
        setError(`Could not reorder sections: ${err.message}`);
        break;
      }
    }
    router.refresh();
  }

  const bySection = new Map(sections.map((s) => [s.id, []]));
  for (const p of products) bySection.get(p.section_id)?.push(p);
  const archivedCount = products.filter((p) => p.archived_at).length;

  return (
    <div className="panel" style={{ padding: '12px 16px' }}>
      <p className="hint" style={{ marginTop: 0 }}>
        One list for the whole venue. The detail line is part of what makes a product distinct —
        a 500ml bottle and a 500ml draught of the same drink are two products.
      </p>
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <form className="filter-row" onSubmit={addSection} style={{ margin: 0 }}>
          <input
            type="text"
            placeholder="New section, e.g. CIDER"
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            aria-label="New section name"
          />
          <button className="btn btn-ghost" type="submit" disabled={!newSection.trim()}>Add section</button>
        </form>
        {archivedCount > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide' : 'Show'} {archivedCount} archived
          </button>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      {sections.length === 0 && (
        <div className="empty-state">No sections yet. Import the client’s range sheet, or add a section above.</div>
      )}

      {sections.map((s, i) => (
        <div key={s.id} className="menu-section-block">
          <div className="menu-section-head">
            <InlineText
              value={s.name}
              label="Section name"
              onSave={(v) => run(supabase.from('menu_sections').update({ name: v }).eq('id', s.id), 'Could not rename that section')}
              required
              className="menu-section-name"
            />
            <button type="button" className="btn btn-ghost" onClick={() => moveSection(i, -1)} disabled={i === 0} aria-label="Move section up">↑</button>
            <button type="button" className="btn btn-ghost" onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} aria-label="Move section down">↓</button>
          </div>
          <table className="data-table menu-product-table">
            <thead>
              <tr><th>Product</th><th>Detail</th><th>Price (£)</th><th>Applies to</th><th /></tr>
            </thead>
            <tbody>
              {(bySection.get(s.id) || []).filter((p) => showArchived || !p.archived_at).map((p) => (
                <tr key={p.id} className={p.archived_at ? 'table-muted' : ''}>
                  <td>
                    <InlineText value={p.name} label="Product name" required
                      onSave={(v) => run(supabase.from('menu_products').update({ name: v }).eq('id', p.id), 'Could not save')} />
                  </td>
                  <td>
                    <InlineText value={p.detail} label="Detail" placeholder="ABV, size, description"
                      onSave={(v) => run(supabase.from('menu_products').update({ detail: v || null }).eq('id', p.id), 'Could not save')} />
                  </td>
                  <td>
                    <InlineText value={p.price} label="Price" placeholder="e.g. 6.60 | 3.30"
                      onSave={(v) => run(supabase.from('menu_products').update({ price: v || null }).eq('id', p.id), 'Could not save')} />
                  </td>
                  <td>
                    <InlineText value={p.tier_note} label="Applies to" placeholder="All"
                      onSave={(v) => run(supabase.from('menu_products').update({ tier_note: v || null }).eq('id', p.id), 'Could not save')} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => run(
                        supabase.from('menu_products').update({ archived_at: p.archived_at ? null : new Date().toISOString() }).eq('id', p.id),
                        'Could not change that product'
                      )}
                    >
                      {p.archived_at ? 'Restore' : 'Archive'}
                    </button>
                  </td>
                </tr>
              ))}
              <AddProductRow
                onAdd={(fields) => run(
                  supabase.from('menu_products').insert({
                    venue_id: venueId,
                    section_id: s.id,
                    position: (bySection.get(s.id) || []).length,
                    ...fields,
                  }),
                  'Could not add that product'
                )}
              />
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function AddProductRow({ onAdd }) {
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [price, setPrice] = useState('');

  async function add() {
    if (!name.trim()) return;
    const ok = await onAdd({ name: name.trim(), detail: detail.trim() || null, price: price.trim() || null });
    if (ok) {
      setName('');
      setDetail('');
      setPrice('');
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  return (
    <tr className="menu-add-row">
      <td><input className="menu-field" placeholder="Add a product…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKey} aria-label="New product name" /></td>
      <td><input className="menu-field" placeholder="Detail" value={detail} onChange={(e) => setDetail(e.target.value)} onKeyDown={onKey} aria-label="New product detail" /></td>
      <td><input className="menu-field" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={onKey} aria-label="New product price" /></td>
      <td />
      <td><button type="button" className="btn btn-ghost" onClick={add} disabled={!name.trim()}>Add</button></td>
    </tr>
  );
}

// Commits on Enter or blur, abandons on Escape — the same contract as the
// project page's inline fields.
export function InlineText({ value, onSave, label, placeholder, required, className }) {
  const [draft, setDraft] = useState(value || '');
  const [prev, setPrev] = useState(value || '');
  // Escape blurs the field too; this stops that blur saving the draft it's
  // meant to be throwing away.
  const abandoning = useRef(false);
  if ((value || '') !== prev) {
    setPrev(value || '');
    setDraft(value || '');
  }

  async function commit() {
    if (abandoning.current) {
      abandoning.current = false;
      return;
    }
    const v = draft.trim();
    if (v === (value || '')) return;
    if (required && !v) {
      setDraft(value || '');
      return;
    }
    const ok = await onSave(v);
    if (!ok) setDraft(value || '');
  }

  return (
    <input
      className={`menu-field${className ? ` ${className}` : ''}`}
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          abandoning.current = true;
          setDraft(value || '');
          e.currentTarget.blur();
        }
      }}
    />
  );
}
