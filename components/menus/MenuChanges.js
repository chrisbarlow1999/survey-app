'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';
import { rangeKey, baseSchedule, screenLabel } from '../../lib/menus';
import { draftItems, changeImpact, describeItem, suggestTitle, STATUSES } from '../../lib/menuChanges';

// A change the client has asked for, from the ask to the screens.
//
//   Raise    three steps — the fixture, the outlets, the products — with a
//            running account of what it affects beside them. The check that
//            takes hours today happens while it's being typed: outlets that
//            share a schedule show the same content, so a change landing on
//            some of them and not the others has to be decided, not discovered.
//   Brief    what the studio reads: every ask in words, the outlets and
//            schedules to reload, and the status it's at.
//   Apply    the moment the menu itself changes. Until then the ranges keep
//            saying what the screens say.
export function MenuChanges({ venueId, sections, products, outlets, sets, ranges, defaultSetId, requests }) {
  const [view, setView] = useState(requests.length ? 'list' : 'new');
  const [selectedId, setSelectedId] = useState(requests[0]?.id || null);

  const selected = requests.find((r) => r.id === selectedId) || null;

  if (view === 'new') {
    return (
      <ChangeForm
        venueId={venueId}
        sections={sections}
        products={products}
        outlets={outlets}
        sets={sets}
        ranges={ranges}
        defaultSetId={defaultSetId}
        onCancel={() => setView(requests.length ? 'list' : 'new')}
        onSaved={(id) => { setSelectedId(id); setView('detail'); }}
      />
    );
  }

  return (
    <div className="split-list">
      <div>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => setView('new')}>Raise a change</button>
        </div>
        {requests.length === 0 && <div className="empty-state">No change requests yet.</div>}
        <div className="list">
          {requests.map((r) => (
            <button
              key={r.id}
              type="button"
              className="list-row"
              aria-current={r.id === selectedId}
              onClick={() => { setSelectedId(r.id); setView('detail'); }}
            >
              <span className="list-row-top">
                <strong>{r.title}</strong>
                <StatusPill status={r.status} />
              </span>
              <span className="meta">
                {sets.find((s) => s.id === r.menu_set_id)?.name || 'No menu set'}
                {r.fixture_date ? ` · fixture ${r.fixture_date}` : ''}
                {` · ${r.menu_change_request_items?.length || 0} ${(r.menu_change_request_items?.length || 0) === 1 ? 'change' : 'changes'}`}
              </span>
            </button>
          ))}
        </div>
      </div>
      {selected
        ? <Brief request={selected} outlets={outlets} sets={sets} />
        : <div className="empty-state">Pick a request to see its brief.</div>}
    </div>
  );
}

function StatusPill({ status }) {
  const label = STATUSES.find((s) => s.key === status)?.label || status;
  const tone = status === 'live' ? 'done' : status === 'cancelled' ? 'open' : status === 'received' ? 'active' : 'open';
  return <span className={`status-pill status-${tone}`}>{label}</span>;
}

// ============================================================
// Raising one
// ============================================================
function ChangeForm({ venueId, sections, products, outlets, sets, ranges, defaultSetId, onCancel, onSaved }) {
  const supabase = createClient();
  const router = useRouter();
  const [setId, setSetId] = useState(defaultSetId || sets[0]?.id || '');
  const [fixtureDate, setFixtureDate] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [tier, setTier] = useState('All');
  const [prices, setPrices] = useState({});
  const [toggles, setToggles] = useState({});
  const [newItems, setNewItems] = useState([]);
  const [adding, setAdding] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ticked = useMemo(() => {
    const s = new Set();
    for (const r of ranges) if (r.menu_set_id === setId) s.add(rangeKey(r.outlet_id, r.product_id));
    return s;
  }, [ranges, setId]);

  const draft = { outletIds: picked, prices, toggles, newItems };
  const items = useMemo(() => draftItems({ products, draft, ticked }), [products, prices, toggles, newItems, picked, ticked]);
  const impact = useMemo(() => changeImpact({ outlets, products, ticked, items }), [outlets, products, ticked, items]);

  const outletNames = new Map(outlets.map((o) => [o.id, o.name]));
  const tiers = ['All', ...new Set(outlets.map((o) => o.menu_tier).filter(Boolean))];
  const shown = outlets.filter((o) =>
    (tier === 'All' || o.menu_tier === tier)
    && (!filter || `${o.name} ${o.menu_tier || ''} ${o.current_schedule || ''}`.toLowerCase().includes(filter.toLowerCase())));

  const unresolved = impact.conflicts.filter((c) => !decisions[c.schedule]);

  function toggleOutlet(id) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function setProductState(productId, on) {
    setToggles((prev) => {
      const next = { ...prev };
      const allSame = [...picked].every((id) => ticked.has(rangeKey(id, productId)) === on);
      if (allSame) delete next[productId];
      else next[productId] = on;
      return next;
    });
  }

  function applyToAll(conflict) {
    setPicked((prev) => {
      const next = new Set(prev);
      conflict.members.forEach((o) => next.add(o.id));
      return next;
    });
    setDecisions((d) => {
      const next = { ...d };
      delete next[conflict.schedule];
      return next;
    });
  }

  async function save() {
    if (!items.length) return;
    setSaving(true);
    setError('');
    const splits = Object.entries(decisions)
      .filter(([, v]) => v === 'split')
      .map(([schedule]) => schedule);
    const noteLines = splits.map((s) => `${s} needs splitting: the change applies to some of its outlets only.`);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: request, error: rErr } = await supabase
        .from('menu_change_requests')
        .insert({
          venue_id: venueId,
          menu_set_id: setId || null,
          title: title.trim() || suggestTitle(items, outletNames),
          requested_by: requestedBy.trim() || null,
          fixture_date: fixtureDate || null,
          notes: noteLines.join('\n') || null,
          created_by: user?.id,
        })
        .select('id')
        .single();
      if (rErr) throw new Error(rErr.message);

      const rows = items.map((item, i) => ({
        request_id: request.id,
        venue_id: venueId,
        kind: item.kind,
        product_id: item.product_id,
        product_label: item.product_label,
        section_name: item.section_name || null,
        detail: item.detail || null,
        from_price: item.from_price || null,
        to_price: item.to_price || null,
        outlet_ids: item.outlet_ids,
        schedule_note: splits.length ? splits.join(', ') : null,
        position: i,
      }));
      const { error: iErr } = await supabase.from('menu_change_request_items').insert(rows);
      if (iErr) {
        throw new Error(`The request was saved but its lines failed: ${iErr.message}`);
      }
      router.refresh();
      onSaved(request.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const bySection = new Map(sections.map((s) => [s.id, []]));
  for (const p of products) bySection.get(p.section_id)?.push(p);

  return (
    <div className="step-flow">
      <div className="step-col">
        <section className="step-card">
          <div className="step-head">
            <h3><span className="step-num">1</span>Fixture</h3>
            <span className="hint" style={{ margin: 0 }}>Which menu the change is for, and when it has to be on screen</span>
          </div>
          <div className="filter-row" style={{ marginTop: 0 }}>
            <label>
              Menu{' '}
              <select value={setId} onChange={(e) => setSetId(e.target.value)}>
                {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>
              Fixture date{' '}
              <input type="date" value={fixtureDate} onChange={(e) => setFixtureDate(e.target.value)} />
            </label>
            <input
              type="text"
              placeholder="Asked for by"
              value={requestedBy}
              onChange={(e) => setRequestedBy(e.target.value)}
              aria-label="Asked for by"
            />
          </div>
        </section>

        <section className="step-card">
          <div className="step-head">
            <h3><span className="step-num">2</span>Outlets</h3>
            <span className="hint" style={{ margin: 0 }}>{picked.size} selected</span>
          </div>
          <div className="filter-row" style={{ marginTop: 0 }}>
            <input
              type="search"
              placeholder="Search outlets"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Search outlets"
            />
            <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Menu tier">
              {tiers.map((t) => <option key={t}>{t}</option>)}
            </select>
            <button type="button" className="btn btn-ghost" onClick={() => setPicked(new Set(shown.map((o) => o.id)))}>
              Select all shown
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPicked(new Set())} disabled={!picked.size}>
              Clear
            </button>
          </div>
          <div className="outlet-grid">
            {shown.map((o) => (
              <button
                key={o.id}
                type="button"
                className="outlet-chip"
                aria-pressed={picked.has(o.id)}
                onClick={() => toggleOutlet(o.id)}
                title={`${o.name}${o.store_code ? ` · ${o.store_code}` : ''} · ${screenLabel(o)}${o.current_schedule ? ` · ${o.current_schedule}` : ''}`}
              >
                <span className="code">{o.name}</span>
                <span className="meta">{o.menu_tier || '—'}</span>
              </button>
            ))}
            {shown.length === 0 && <span className="hint">No outlets match.</span>}
          </div>
        </section>

        <section className={`step-card${picked.size ? '' : ' step-muted'}`}>
          <div className="step-head">
            <h3><span className="step-num">3</span>Products</h3>
            <span className="hint" style={{ margin: 0 }}>
              {picked.size ? 'On and off apply to the selected outlets. A price applies everywhere it’s sold.' : 'Select outlets first to switch products on or off'}
            </span>
          </div>
          {sections.map((s) => (
            <div key={s.id} className="menu-section-block">
              <div className="menu-section-head">
                <span className="menu-section-name">{s.name}</span>
                <button type="button" className="link-button" onClick={() => setAdding({ section: s.name, name: '', detail: '', price: '' })}>
                  + Add a product
                </button>
              </div>
              {adding?.section === s.name && (
                <div className="filter-row" style={{ margin: '4px 0 8px' }}>
                  <input placeholder="Product name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} aria-label="New product name" />
                  <input placeholder="Detail" value={adding.detail} onChange={(e) => setAdding({ ...adding, detail: e.target.value })} aria-label="New product detail" />
                  <input placeholder="Price" value={adding.price} onChange={(e) => setAdding({ ...adding, price: e.target.value })} aria-label="New product price" />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!adding.name.trim() || !picked.size}
                    onClick={() => { setNewItems((n) => [...n, { ...adding, tempId: `n${Date.now()}` }]); setAdding(null); }}
                  >
                    Add to the request
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setAdding(null)}>Cancel</button>
                  {!picked.size && <span className="hint" style={{ margin: 0 }}>Select the outlets that will sell it first.</span>}
                </div>
              )}
              <table className="data-table menu-product-table">
                <thead>
                  <tr><th>Product</th><th>Price (£)</th><th>Sold at</th><th>At selected outlets</th></tr>
                </thead>
                <tbody>
                  {(bySection.get(s.id) || []).map((p) => {
                    const at = [...picked].filter((id) => ticked.has(rangeKey(id, p.id))).length;
                    const wanted = toggles[p.id];
                    const on = wanted === undefined ? (picked.size > 0 && at === picked.size) : wanted;
                    const off = wanted === undefined ? (picked.size > 0 && at === 0) : !wanted;
                    const priceChanged = prices[p.id] != null && prices[p.id].trim() !== (p.price || '').trim();
                    return (
                      <tr key={p.id} className={priceChanged || wanted !== undefined ? 'row-changed' : ''}>
                        <td>
                          <div className="pname">{p.name}</div>
                          {p.detail && <div className="meta">{p.detail}</div>}
                        </td>
                        <td>
                          <input
                            className="menu-field"
                            value={prices[p.id] ?? (p.price || '')}
                            onChange={(e) => setPrices({ ...prices, [p.id]: e.target.value })}
                            aria-label={`${p.name} price`}
                            style={{ maxWidth: 110 }}
                          />
                        </td>
                        <td className="meta">{countSold(p.id, ticked)} outlets</td>
                        <td>
                          <span className="onoff">
                            <button type="button" className={`on${on ? ' is-on' : ''}`} disabled={!picked.size} onClick={() => setProductState(p.id, true)}>On</button>
                            <button type="button" className={`off${off ? ' is-off' : ''}`} disabled={!picked.size} onClick={() => setProductState(p.id, false)}>Off</button>
                          </span>
                          {picked.size > 0 && at > 0 && at < picked.size && wanted === undefined && (
                            <span className="meta"> on at {at} of {picked.size}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {newItems.length > 0 && (
            <div className="menu-section-block">
              <div className="menu-section-head"><span className="menu-section-name">New products in this request</span></div>
              <ul className="change-lines">
                {newItems.map((n) => (
                  <li key={n.tempId}>
                    <strong>{n.name}</strong> <span className="meta">{n.section}{n.detail ? ` · ${n.detail}` : ''}{n.price ? ` · £${n.price}` : ''}</span>
                    <button type="button" className="link-button" onClick={() => setNewItems((list) => list.filter((x) => x.tempId !== n.tempId))}>Remove</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <aside className="step-aside" aria-live="polite">
        <h3 style={{ marginTop: 0 }}>What this affects</h3>
        {!items.length && (
          <p className="hint" style={{ marginTop: 0 }}>
            Change a price, or switch a product on or off at the outlets you picked, and this panel lists
            every outlet and schedule it touches — including outlets that share a schedule with them.
          </p>
        )}
        {items.length > 0 && (
          <>
            <div className="step-stats">
              <div><b>{impact.outlets.length}</b><span>outlets</span></div>
              <div><b>{impact.schedules.length}</b><span>schedules</span></div>
              <div><b>{items.length}</b><span>changes</span></div>
            </div>

            {impact.conflicts.map((c) => (
              <div key={c.schedule} className={`conflict-card${decisions[c.schedule] ? ' is-resolved' : ''}`}>
                <strong>{decisions[c.schedule] ? `${c.schedule} — split noted` : `Shared schedule: ${c.schedule}`}</strong>
                <p style={{ margin: '4px 0' }}>
                  {c.items.map((i) => (
                    <span key={i.label}>
                      <b>{i.label}</b> changes at {i.inChange.map((o) => o.name).join(', ')} but not {i.others.map((o) => o.name).join(', ')}.{' '}
                    </span>
                  ))}
                  They share one schedule, so they show the same content today.
                </p>
                {decisions[c.schedule] ? (
                  <button type="button" className="link-button" onClick={() => setDecisions((d) => ({ ...d, [c.schedule]: undefined }))}>Undo</button>
                ) : (
                  <div className="toolbar">
                    <button type="button" className="btn btn-ghost" onClick={() => applyToAll(c)}>
                      Change all {c.members.length}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setDecisions((d) => ({ ...d, [c.schedule]: 'split' }))}>
                      Split the schedule
                    </button>
                  </div>
                )}
              </div>
            ))}

            <ul className="change-lines">
              {items.map((item, i) => <li key={i}>{describeItem(item, outletNames)}</li>)}
            </ul>

            <input
              type="text"
              placeholder={suggestTitle(items, outletNames)}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Request title"
              style={{ width: '100%', marginTop: 8 }}
            />
            {error && <p className="error-text">{error}</p>}
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving || unresolved.length > 0}>
                {saving ? 'Saving…' : unresolved.length ? `Decide ${unresolved.length} shared ${unresolved.length === 1 ? 'schedule' : 'schedules'}` : 'Save request'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            </div>
          </>
        )}
        {!items.length && (
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          </div>
        )}
      </aside>
    </div>
  );
}

function countSold(productId, ticked) {
  let n = 0;
  for (const k of ticked) if (k.endsWith(`:${productId}`)) n++;
  return n;
}

// ============================================================
// The brief
// ============================================================
function Brief({ request, outlets, sets }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const items = [...(request.menu_change_request_items || [])].sort((a, b) => a.position - b.position);
  const outletNames = new Map(outlets.map((o) => [o.id, o.name]));
  const byId = new Map(outlets.map((o) => [o.id, o]));
  const touched = [...new Set(items.flatMap((i) => i.outlet_ids || []))];
  const schedules = [...new Set(touched.map((id) => baseSchedule(byId.get(id)?.current_schedule)).filter(Boolean))].sort();
  const index = STATUSES.findIndex((s) => s.key === request.status);

  async function setStatus(status) {
    setBusy(true);
    setError('');
    const { error: err } = await supabase
      .from('menu_change_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', request.id);
    setBusy(false);
    if (err) setError(err.message);
    else router.refresh();
  }

  async function applyToMenu() {
    setBusy(true);
    setError('');
    setResult('');
    const { data, error: err } = await supabase.rpc('menu_apply_change_request', { p_request_id: request.id });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setResult(
      `Applied: ${data.prices} price${data.prices === 1 ? '' : 's'}, ${data.ticks_added} tick${data.ticks_added === 1 ? '' : 's'} added, `
      + `${data.ticks_removed} removed${data.products_created ? `, ${data.products_created} product${data.products_created === 1 ? '' : 's'} created` : ''}.`
    );
    router.refresh();
  }

  return (
    <article className="panel" style={{ padding: '16px 18px' }}>
      <div className="brief-top">
        <div>
          <h3 style={{ margin: 0 }}>{request.title}</h3>
          <p className="meta" style={{ margin: '4px 0 0' }}>
            {sets.find((s) => s.id === request.menu_set_id)?.name || 'No menu set'}
            {request.fixture_date ? ` · fixture ${request.fixture_date}` : ''}
            {request.requested_by ? ` · asked for by ${request.requested_by}` : ''}
            {request.applied_at ? ` · applied ${new Date(request.applied_at).toLocaleDateString('en-GB')}` : ''}
          </p>
        </div>
        <StatusPill status={request.status} />
      </div>

      <div className="status-steps">
        {STATUSES.map((s, i) => (
          <span key={s.key} className={i < index ? 'done' : i === index ? 'now' : ''}>{s.label}</span>
        ))}
      </div>

      <div className="toolbar" style={{ margin: '10px 0' }}>
        {index >= 0 && index < STATUSES.length - 1 && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setStatus(STATUSES[index + 1].key)}>
            {['Start design', 'Mark ready to load', 'Mark live'][index]}
          </button>
        )}
        <button type="button" className="btn btn-primary" disabled={busy || Boolean(request.applied_at)} onClick={applyToMenu}>
          {request.applied_at ? 'Already applied to the menu' : 'Apply to the menu'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {result && <p className="hint" style={{ color: 'var(--success)' }}>{result}</p>}

      <h4 style={{ marginBottom: 4 }}>What was asked for</h4>
      <ul className="change-lines">
        {items.map((item) => <li key={item.id}>{describeItem({ ...item, soldAt: null }, outletNames)}</li>)}
      </ul>

      <h4 style={{ marginBottom: 4 }}>Outlets to reload</h4>
      <div className="chip-row">
        {touched.map((id) => (
          <span className="chip" key={id} title={byId.get(id)?.store_code || ''}>
            {outletNames.get(id) || '—'}{byId.get(id)?.store_code ? ` · ${byId.get(id).store_code}` : ''}
          </span>
        ))}
        {touched.length === 0 && <span className="hint">Price changes only — every outlet selling those products.</span>}
      </div>

      <h4 style={{ marginBottom: 4 }}>Schedules</h4>
      <div className="chip-row">
        {schedules.map((s) => <span className="chip" key={s}>{s}</span>)}
        {schedules.length === 0 && <span className="hint">None of these outlets is on a schedule yet.</span>}
      </div>

      {request.notes && (
        <>
          <h4 style={{ marginBottom: 4 }}>Notes</h4>
          <p className="hint" style={{ whiteSpace: 'pre-line', marginTop: 0 }}>{request.notes}</p>
        </>
      )}

      <p className="hint" style={{ marginTop: 14 }}>
        Artwork previews need the asset library — the list of what each stock code shows — which isn&apos;t in
        either spreadsheet yet.
      </p>
    </article>
  );
}
