'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { formatGBP } from '../lib/money';
import { sheetTotals, lineCost, linePrice, rateFor } from '../lib/costSheet';

// The priced sheet. Cost and margin are shown throughout — this screen is
// internal only, and the client's copy is built by a separate database
// function that strips cost out of every line (migration 036).
//
// Saving is explicit rather than per-keystroke. Everywhere else in this app a
// field saves as you leave it, which is right for a status or an owner; a
// money document wants one deliberate "save", so a half-typed unit price never
// becomes the stored total.
export function CostSheetEditor({ sheet, survey, catalogue, clientRates, canEdit }) {
  const supabase = createClient();
  const router = useRouter();

  const [items, setItems] = useState(() => (Array.isArray(sheet.items) ? sheet.items : []));
  const [reference, setReference] = useState(sheet.reference || '');
  const [title, setTitle] = useState(sheet.title || '');
  const [terms, setTerms] = useState(sheet.terms || '');
  const [internalNotes, setInternalNotes] = useState(sheet.internal_notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [addId, setAddId] = useState('');

  const totals = sheetTotals(items);
  const rateByItem = new Map((clientRates || []).map((r) => [r.price_item_id, r]));
  // A sent sheet is what the client is looking at, so editing it would change
  // the document under them. Withdraw or reopen it first.
  const locked = !canEdit || sheet.approval_status === 'awaiting';

  function patch(index, field, value) {
    setSaved(false);
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function removeLine(index) {
    setSaved(false);
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addBlank() {
    setSaved(false);
    setItems((prev) => [...prev, { description: '', unit: 'each', qty: 1, unit_cost: null, unit_price: null }]);
  }

  function addFromCatalogue(id) {
    const item = (catalogue || []).find((c) => c.id === id);
    if (!item) return;
    const rate = rateFor(item, rateByItem.get(item.id));
    setSaved(false);
    setItems((prev) => [...prev, {
      description: item.name,
      unit: item.unit || 'each',
      qty: 1,
      unit_cost: rate.cost,
      unit_price: rate.price,
      match_key: item.match_key || null,
    }]);
    setAddId('');
  }

  // Numbers come out of an input as strings. They're stored as numbers so the
  // totals written to the row are arithmetic, not string concatenation, and so
  // the client-facing page can format them.
  function clean(list) {
    return list.map((it) => ({
      description: (it.description || '').trim(),
      unit: (it.unit || 'each').trim(),
      qty: Number(it.qty) || 0,
      unit_cost: it.unit_cost === '' || it.unit_cost == null ? null : Number(it.unit_cost),
      unit_price: it.unit_price === '' || it.unit_price == null ? null : Number(it.unit_price),
      ...(it.match_key ? { match_key: it.match_key } : {}),
    }));
  }

  async function save() {
    setSaving(true);
    setError('');
    setSaved(false);

    const cleaned = clean(items);
    const t = sheetTotals(cleaned);

    const { data, error: updErr } = await supabase
      .from('cost_sheets')
      .update({
        items: cleaned,
        // Stored so a list of sheets can show money without reading every
        // line. Recalculated here on every save, which is the only thing that
        // keeps them true.
        total_cost: t.cost,
        total_price: t.price,
        reference: reference.trim() || null,
        title: title.trim() || null,
        terms: terms.trim() || null,
        internal_notes: internalNotes.trim() || null,
      })
      .eq('id', sheet.id)
      .select('id');

    setSaving(false);
    if (updErr) {
      console.error(updErr);
      setError('Could not save this sheet.');
      return;
    }
    // An update matching no rows returns no error — it just does nothing.
    if (!data || data.length === 0) {
      setError('That change was refused — you may not have edit access to this sheet.');
      return;
    }
    setItems(cleaned);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="panel">
      <h2>
        Cost sheet
        {totals.unpriced > 0 && (
          <span className="status-pill status-warn" style={{ marginLeft: 10, verticalAlign: 'middle' }}>
            {totals.unpriced} line{totals.unpriced === 1 ? '' : 's'} without a price
          </span>
        )}
      </h2>
      <p className="hint">
        Built from the survey at {survey?.site_location || 'this site'}. Quantities came from the
        areas and screens recorded there; prices came from the catalogue and this client&apos;s rates
        where they exist. Everything here is editable, and cost and margin are internal — the
        client&apos;s copy never includes them.
      </p>

      {locked && (
        <div className="archived-banner">
          {sheet.approval_status === 'awaiting'
            ? 'This sheet is out with the client. Withdraw or reopen it before editing, so the document they are looking at cannot change underneath them.'
            : 'You do not have edit access to this sheet.'}
        </div>
      )}

      <div className="field-row">
        <div className="field">
          <label>Reference</label>
          <input type="text" value={reference} disabled={locked} onChange={(e) => { setReference(e.target.value); setSaved(false); }} placeholder="e.g. Q-1042" />
        </div>
        <div className="field" style={{ flex: 2, minWidth: 240 }}>
          <label>Title</label>
          <input type="text" value={title} disabled={locked} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} placeholder="e.g. Reception screen installation" />
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table cost-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Unit</th>
              <th className="num">Qty</th>
              <th className="num">Unit cost</th>
              <th className="num">Unit price</th>
              <th className="num">Line cost</th>
              <th className="num">Line price</th>
              <th className="num">Margin</th>
              {!locked && <th />}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={locked ? 8 : 9}>
                  <span className="table-muted">No lines yet — add one below.</span>
                </td>
              </tr>
            )}
            {items.map((it, i) => {
              const c = lineCost(it);
              const p = linePrice(it);
              const noPrice = it.unit_price == null || it.unit_price === '';
              return (
                <tr key={i} className={noPrice ? 'cost-row-unpriced' : ''}>
                  <td>
                    <input type="text" value={it.description || ''} disabled={locked}
                      onChange={(e) => patch(i, 'description', e.target.value)} />
                  </td>
                  <td className="cost-col-unit">
                    <input type="text" value={it.unit || ''} disabled={locked}
                      onChange={(e) => patch(i, 'unit', e.target.value)} />
                  </td>
                  <td className="num cost-col-num">
                    <input type="number" min="0" step="1" value={it.qty ?? ''} disabled={locked}
                      onChange={(e) => patch(i, 'qty', e.target.value)} />
                  </td>
                  <td className="num cost-col-num">
                    <input type="number" min="0" step="0.01" value={it.unit_cost ?? ''} disabled={locked}
                      placeholder="—" onChange={(e) => patch(i, 'unit_cost', e.target.value)} />
                  </td>
                  <td className="num cost-col-num">
                    <input type="number" min="0" step="0.01" value={it.unit_price ?? ''} disabled={locked}
                      placeholder="—" onChange={(e) => patch(i, 'unit_price', e.target.value)} />
                  </td>
                  <td className="num">{formatGBP(c)}</td>
                  <td className="num">{noPrice ? <span className="table-muted">—</span> : formatGBP(p)}</td>
                  <td className="num">{noPrice ? <span className="table-muted">—</span> : formatGBP(p - c)}</td>
                  {!locked && (
                    <td className="num">
                      <button type="button" className="cost-remove" title="Remove line" onClick={() => removeLine(i)}>×</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>Totals (excluding VAT)</td>
              <td className="num">{formatGBP(totals.cost)}</td>
              <td className="num">{formatGBP(totals.price)}</td>
              <td className="num">
                {formatGBP(totals.margin)}
                {totals.marginPct != null && (
                  <span className="mix-share" style={{ marginLeft: 6 }}>{totals.marginPct.toFixed(1)}%</span>
                )}
              </td>
              {!locked && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {!locked && (
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={addBlank}>+ Add line</button>
          <select
            className="inline-select"
            value={addId}
            onChange={(e) => { setAddId(e.target.value); addFromCatalogue(e.target.value); }}
          >
            <option value="">Add from catalogue…</option>
            {(catalogue || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="field-row" style={{ marginTop: 14 }}>
        <div className="field" style={{ flex: '1 1 100%' }}>
          <label>Terms shown to the client</label>
          <textarea value={terms} disabled={locked} onChange={(e) => { setTerms(e.target.value); setSaved(false); }}
            placeholder="e.g. Prices exclude VAT. Valid for 30 days. Access and parking to be provided on site." />
        </div>
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: '1 1 100%' }}>
          <label>Internal notes</label>
          <textarea value={internalNotes} disabled={locked} onChange={(e) => { setInternalNotes(e.target.value); setSaved(false); }}
            placeholder="Never shown to the client." />
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {!locked && (
        <div className="actions-row" style={{ marginBottom: 0 }}>
          <span className="hint" style={{ marginRight: 'auto' }}>
            {saved ? 'Saved.' : 'Unsaved changes.'}
          </span>
          <button className="btn btn-primary" type="button" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save sheet'}
          </button>
        </div>
      )}
    </div>
  );
}
