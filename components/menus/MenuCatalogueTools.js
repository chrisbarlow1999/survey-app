'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';
import { productKey } from '../../lib/menus';

// The two doors between a venue's product list and its client's catalogue.
//
//   Add from catalogue   pick lines the venue doesn't have yet
//   Send to catalogue    put this venue's products into the library, so the
//                        client's next venue starts from them
//
// Both run as database functions so a half-finished copy can't be left behind,
// and both skip anything already there — pressing either twice is harmless.
export function MenuCatalogueTools({ venueId, clientId, clientName, catalogue, sections, products }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  // What this venue already holds, by the same identity rule the catalogue uses.
  const sectionName = new Map(sections.map((s) => [s.id, s.name]));
  const held = new Set(products.map((p) => productKey(sectionName.get(p.section_id), p.name, p.detail)));
  const heldCatalogueIds = new Set(products.map((p) => p.catalogue_id).filter(Boolean));
  const available = catalogue.filter(
    (c) => !c.archived_at && !heldCatalogueIds.has(c.id) && !held.has(productKey(c.section_name, c.name, c.detail))
  );

  function toggle(id) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function addPicked() {
    if (!picked.size) return;
    setBusy('add');
    setError('');
    setDone('');
    const { data, error: err } = await supabase.rpc('menu_catalogue_add_to_venue', {
      p_venue_id: venueId,
      p_catalogue_ids: [...picked],
    });
    setBusy('');
    if (err) {
      setError(`Could not add those products: ${err.message}`);
      return;
    }
    setPicked(new Set());
    setOpen(false);
    setDone(`Added ${data} ${data === 1 ? 'product' : 'products'} from the catalogue. Prices came across — change them here if this venue charges something else.`);
    router.refresh();
  }

  async function capture() {
    setBusy('capture');
    setError('');
    setDone('');
    const { data, error: err } = await supabase.rpc('menu_catalogue_capture_venue', { p_venue_id: venueId });
    setBusy('');
    if (err) {
      setError(`Could not send these to the catalogue: ${err.message}`);
      return;
    }
    setDone(
      data === 0
        ? 'Every product here was already in the catalogue.'
        : `Added ${data} ${data === 1 ? 'product' : 'products'} to ${clientName}'s catalogue.`
    );
    router.refresh();
  }

  const bySection = new Map();
  for (const c of available) {
    const key = c.section_name.trim();
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(c);
  }

  return (
    <div className="menu-catalogue-tools">
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen((v) => !v)}
          disabled={available.length === 0}
          title={available.length === 0 ? 'This venue already has everything in the catalogue' : undefined}
        >
          Add from catalogue{available.length ? ` (${available.length})` : ''}
        </button>
        <button type="button" className="btn btn-ghost" onClick={capture} disabled={busy === 'capture'}>
          {busy === 'capture' ? 'Sending…' : 'Send to catalogue'}
        </button>
        <a className="btn btn-ghost" href={`/menus/catalogue/${clientId}`}>Open {clientName}&apos;s catalogue</a>
      </div>

      {error && <p className="error-text">{error}</p>}
      {done && <p className="hint" style={{ color: 'var(--success)' }}>{done}</p>}

      {open && (
        <div className="panel" style={{ padding: '10px 12px', marginBottom: 10 }}>
          <div className="toolbar" style={{ marginBottom: 6 }}>
            <strong style={{ fontSize: 13.5 }}>Catalogue products this venue doesn&apos;t have</strong>
            <button type="button" className="btn btn-ghost" onClick={() => setPicked(new Set(available.map((c) => c.id)))}>Select all</button>
            <button type="button" className="btn btn-ghost" onClick={() => setPicked(new Set())} disabled={!picked.size}>Clear</button>
            <button type="button" className="btn btn-primary" onClick={addPicked} disabled={!picked.size || busy === 'add'}>
              {busy === 'add' ? 'Adding…' : `Add ${picked.size || ''} to this venue`}
            </button>
          </div>
          {[...bySection.entries()].map(([section, rows]) => (
            <div key={section} style={{ marginBottom: 8 }}>
              <div className="meta" style={{ marginBottom: 2 }}>{section}</div>
              <div className="menu-catalogue-picker">
                {rows.map((c) => (
                  <label key={c.id} className="menu-import-check" style={{ margin: 0 }}>
                    <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                    <span>
                      {c.name}
                      {c.detail ? <span className="meta"> · {c.detail}</span> : null}
                      {c.price ? <span className="meta"> · £{c.price}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
