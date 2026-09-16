'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';
import { rangeKey, diffSets, screenLabel } from '../../lib/menus';

// The client's "Products by area" sheet, as a live grid: products down the
// side, outlets across the top, one box per cell. Laid out the same way round
// as the sheet on purpose, so the client recognises it.
//
// Every tick saves as it's clicked, like the rest of the app's inline fields.
// Saves are optimistic and roll back if the write is refused.
export function MenuGrid({ venueId, sections, products, outlets, sets, ranges, setId, compareId }) {
  const supabase = createClient();
  const router = useRouter();

  // One Set of "outlet:product" keys per menu set.
  const [ticked, setTicked] = useState(() => {
    const map = new Map(sets.map((s) => [s.id, new Set()]));
    for (const r of ranges) map.get(r.menu_set_id)?.add(rangeKey(r.outlet_id, r.product_id));
    return map;
  });
  const [filter, setFilter] = useState('');
  const [activeOutlet, setActiveOutlet] = useState(null);
  const [copyFrom, setCopyFrom] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetFrom, setNewSetFrom] = useState(setId || '');
  const [showDiff, setShowDiff] = useState(true);

  const current = ticked.get(setId) || new Set();
  const setName = sets.find((s) => s.id === setId)?.name;
  const compareName = sets.find((s) => s.id === compareId)?.name;
  const compare = compareId ? ticked.get(compareId) || new Set() : null;

  const visibleOutlets = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return outlets;
    return outlets.filter((o) =>
      [o.name, o.menu_tier, o.menu_type, o.current_schedule].some((v) => (v || '').toLowerCase().includes(q))
    );
  }, [outlets, filter]);

  const sectionRows = useMemo(() => {
    const bySection = new Map(sections.map((s) => [s.id, []]));
    for (const p of products) bySection.get(p.section_id)?.push(p);
    return sections.map((s) => ({ section: s, products: bySection.get(s.id) || [] })).filter((r) => r.products.length);
  }, [sections, products]);

  const diff = useMemo(
    () => (compare ? diffSets(outlets, products, compare, current) : []),
    [compare, current, outlets, products]
  );

  function href(next) {
    const qs = new URLSearchParams();
    const s = next.set ?? setId;
    const c = next.compare === undefined ? compareId : next.compare;
    if (s && s !== sets[0]?.id) qs.set('set', s);
    if (c && c !== s) qs.set('compare', c);
    const str = qs.toString();
    return `/menus/${venueId}${str ? `?${str}` : ''}`;
  }

  function mutate(fn) {
    setTicked((prev) => {
      const next = new Map(prev);
      const copy = new Set(next.get(setId));
      fn(copy);
      next.set(setId, copy);
      return next;
    });
  }

  async function toggle(outletId, productId) {
    if (!setId) return;
    const key = rangeKey(outletId, productId);
    const wasOn = current.has(key);
    setError('');
    mutate((s) => (wasOn ? s.delete(key) : s.add(key)));

    const { error: err } = wasOn
      ? await supabase.from('menu_ranges').delete()
          .eq('menu_set_id', setId).eq('outlet_id', outletId).eq('product_id', productId)
      : await supabase.from('menu_ranges')
          .insert({ menu_set_id: setId, outlet_id: outletId, product_id: productId, venue_id: venueId });

    if (err) {
      mutate((s) => (wasOn ? s.add(key) : s.delete(key)));
      setError(`Could not save that tick: ${err.message}`);
    }
  }

  // Tick or untick one product across every outlet currently shown — which is
  // how "add it to every North Stand kiosk" is done: filter, then apply.
  async function setRow(productId, on) {
    const ids = visibleOutlets.map((o) => o.id);
    if (!ids.length || !setId) return;
    const before = new Set(current);
    setError('');
    mutate((s) => ids.forEach((oid) => (on ? s.add(rangeKey(oid, productId)) : s.delete(rangeKey(oid, productId)))));

    const { error: err } = on
      ? await supabase.from('menu_ranges').upsert(
          ids.map((oid) => ({ menu_set_id: setId, outlet_id: oid, product_id: productId, venue_id: venueId })),
          { onConflict: 'menu_set_id,outlet_id,product_id', ignoreDuplicates: true }
        )
      : await supabase.from('menu_ranges').delete()
          .eq('menu_set_id', setId).eq('product_id', productId).in('outlet_id', ids);

    if (err) {
      setTicked((prev) => new Map(prev).set(setId, before));
      setError(`Could not update that row: ${err.message}`);
    }
  }

  async function copyOutlet() {
    if (!activeOutlet || !copyFrom || !setId) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('menu_copy_outlet_range', {
      p_set_id: setId, p_from_outlet: copyFrom, p_to_outlet: activeOutlet.id,
    });
    setBusy(false);
    if (err) {
      setError(`Could not copy that range: ${err.message}`);
      return;
    }
    mutate((s) => {
      for (const p of products) {
        const from = s.has(rangeKey(copyFrom, p.id));
        if (from) s.add(rangeKey(activeOutlet.id, p.id));
        else s.delete(rangeKey(activeOutlet.id, p.id));
      }
    });
    setCopyFrom('');
  }

  async function createSet(e) {
    e.preventDefault();
    const name = newSetName.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    const { data: created, error: err } = await supabase
      .from('menu_sets')
      .insert({ venue_id: venueId, name, position: sets.length })
      .select('id')
      .single();
    if (err) {
      setBusy(false);
      setError(`Could not add that menu set: ${err.message}`);
      return;
    }
    if (newSetFrom) {
      const { error: copyErr } = await supabase.rpc('menu_copy_set', { p_from_set: newSetFrom, p_to_set: created.id });
      if (copyErr) {
        setBusy(false);
        setError(`The set was added, but copying the ticks into it failed: ${copyErr.message}`);
        return;
      }
    }
    setBusy(false);
    setNewSetName('');
    // A full navigation, so the new set's ticks load from the server.
    window.location.href = href({ set: created.id, compare: newSetFrom || null });
  }

  if (!sets.length) {
    return <div className="panel"><div className="empty-state">This venue has no menu sets yet. Add one below.</div>{renderNewSet()}</div>;
  }

  function renderNewSet() {
    return (
      <form className="filter-row menu-newset" onSubmit={createSet} style={{ marginTop: 12 }}>
        <input
          type="text"
          placeholder="New menu set, e.g. UEFA"
          value={newSetName}
          onChange={(e) => setNewSetName(e.target.value)}
          aria-label="New menu set name"
        />
        <select value={newSetFrom} onChange={(e) => setNewSetFrom(e.target.value)} aria-label="Start the new set from">
          <option value="">Start empty</option>
          {sets.map((s) => <option key={s.id} value={s.id}>Copy ticks from {s.name}</option>)}
        </select>
        <button className="btn btn-ghost" type="submit" disabled={busy || !newSetName.trim()}>Add menu set</button>
      </form>
    );
  }

  const soldAt = (productId) => outlets.reduce((n, o) => n + (current.has(rangeKey(o.id, productId)) ? 1 : 0), 0);

  return (
    <>
      <div className="panel" style={{ padding: '14px 16px' }}>
        <div className="menu-toolbar">
          <div className="segmented" role="group" aria-label="Menu set">
            {sets.map((s) => (
              <button
                key={s.id}
                type="button"
                className={s.id === setId ? 'on' : ''}
                onClick={() => router.push(href({ set: s.id, compare: compareId === s.id ? null : compareId }))}
              >
                {s.name}
              </button>
            ))}
          </div>
          {sets.length > 1 && (
            <select
              value={compareId || ''}
              onChange={(e) => router.push(href({ compare: e.target.value || null }))}
              aria-label="Compare with another set"
            >
              <option value="">Compare with…</option>
              {sets.filter((s) => s.id !== setId).map((s) => <option key={s.id} value={s.id}>Compare with {s.name}</option>)}
            </select>
          )}
          <input
            type="search"
            placeholder="Filter outlets — name, menu tier, schedule"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter outlets"
            style={{ minWidth: 280 }}
          />
          <span className="hint" style={{ margin: 0 }}>
            Showing {visibleOutlets.length} of {outlets.length} outlets
          </span>
        </div>
        {renderNewSet()}
        {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
      </div>

      {compare && (
        <div className="panel" style={{ padding: '12px 16px' }}>
          <div className="menu-diff-head">
            <strong>
              {diff.length === 0
                ? `No differences from ${compareName}.`
                : `${diff.length} outlet${diff.length === 1 ? '' : 's'} differ from ${compareName}`}
            </strong>
            {diff.length > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setShowDiff((v) => !v)}>
                {showDiff ? 'Hide list' : 'Show list'}
              </button>
            )}
          </div>
          {showDiff && diff.length > 0 && (
            <ul className="menu-diff-list">
              {diff.map((d) => (
                <li key={d.outlet.id}>
                  <strong>{d.outlet.name}</strong>
                  {d.added.length > 0 && <span className="menu-diff-add"> + {d.added.map((p) => p.name).join(', ')}</span>}
                  {d.removed.length > 0 && <span className="menu-diff-remove"> − {d.removed.map((p) => p.name).join(', ')}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="hint" style={{ marginBottom: 0 }}>
            <span className="menu-diff-add">+ sold under {setName}</span> but not {compareName};{' '}
            <span className="menu-diff-remove">− sold under {compareName}</span> but not {setName}. In the grid these
            show as a green box and a red outline.
          </p>
        </div>
      )}

      {activeOutlet && (
        <div className="panel menu-outlet-bar">
          <div>
            <strong>{activeOutlet.name}</strong>
            <span className="hint" style={{ margin: '0 0 0 8px' }}>
              {[activeOutlet.menu_tier, activeOutlet.menu_type, screenLabel(activeOutlet), activeOutlet.current_schedule].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="filter-row" style={{ margin: 0 }}>
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} aria-label="Copy range from">
              <option value="">Make identical to…</option>
              {outlets.filter((o) => o.id !== activeOutlet.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button type="button" className="btn btn-primary" disabled={!copyFrom || busy} onClick={copyOutlet}>
              {busy ? 'Copying…' : 'Copy range'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setActiveOutlet(null); setCopyFrom(''); }}>Close</button>
          </div>
        </div>
      )}

      <div className="panel menu-grid-panel">
        {products.length === 0 || outlets.length === 0 ? (
          <div className="empty-state">
            Nothing to tick yet. Use the Import tab to load the client’s range sheet, or add products and outlets by hand.
          </div>
        ) : (
          <div className="menu-grid-scroll">
            <table className="menu-grid">
              <thead>
                <tr>
                  <th className="menu-grid-corner">Product</th>
                  {visibleOutlets.map((o) => (
                    <th key={o.id} className={`menu-grid-outlet${activeOutlet?.id === o.id ? ' on' : ''}`}>
                      <button
                        type="button"
                        onClick={() => setActiveOutlet(activeOutlet?.id === o.id ? null : o)}
                        title={[o.name, o.menu_tier, o.menu_type, screenLabel(o), o.current_schedule].filter(Boolean).join('\n')}
                      >
                        <span>{o.name}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sectionRows.map(({ section, products: rows }) => (
                  <SectionRows
                    key={section.id}
                    section={section}
                    rows={rows}
                    outlets={visibleOutlets}
                    current={current}
                    compare={compare}
                    activeOutletId={activeOutlet?.id}
                    soldAt={soldAt}
                    total={outlets.length}
                    onToggle={toggle}
                    onRow={setRow}
                    filtered={visibleOutlets.length !== outlets.length}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function SectionRows({ section, rows, outlets, current, compare, activeOutletId, soldAt, total, onToggle, onRow, filtered }) {
  return (
    <>
      <tr className="menu-grid-section">
        <th scope="rowgroup">{section.name}</th>
        <td colSpan={outlets.length} />
      </tr>
      {rows.map((p) => (
        <tr key={p.id}>
          <th scope="row" className="menu-grid-product">
            <div className="menu-grid-product-name">
              {p.name}
              {p.price ? <span className="menu-grid-price">£{p.price}</span> : null}
            </div>
            {(p.detail || p.tier_note) && (
              <div className="menu-grid-product-detail">{[p.tier_note, p.detail].filter(Boolean).join(' · ')}</div>
            )}
            <div className="menu-grid-row-actions">
              <span>{soldAt(p.id)}/{total}</span>
              <button type="button" onClick={() => onRow(p.id, true)} title={filtered ? 'Tick for every outlet shown' : 'Tick for every outlet'}>
                all{filtered ? ' shown' : ''}
              </button>
              <button type="button" onClick={() => onRow(p.id, false)} title={filtered ? 'Untick for every outlet shown' : 'Untick for every outlet'}>
                none
              </button>
            </div>
          </th>
          {outlets.map((o) => {
            const key = rangeKey(o.id, p.id);
            const on = current.has(key);
            const other = compare ? compare.has(key) : on;
            const cls = [
              'menu-cell',
              on ? 'on' : '',
              compare && on && !other ? 'diff-add' : '',
              compare && !on && other ? 'diff-remove' : '',
              activeOutletId === o.id ? 'col-on' : '',
            ].filter(Boolean).join(' ');
            return (
              <td key={o.id} className={cls}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${p.name} at ${o.name}`}
                  onClick={() => onToggle(o.id, p.id)}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
