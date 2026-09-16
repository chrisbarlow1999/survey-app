'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';
import { buildImportPlan, applyImportPlan } from '../../lib/menuImport';

// Load a venue from the spreadsheets it runs on today.
//
//   The client's range sheet  → sections, products, outlets and one set's ticks
//   The master schedule KEY   → store codes, screen counts, current schedules
//
// Either can come alone, in either order; each import only touches what its
// sheet knows about. Nothing is written until the preview has been read and
// Apply pressed, and the preview is the useful part on a re-import: it lists
// exactly which outlets gained or lost which products since last time, which
// is the comparison that currently takes hours by eye.
//
// Products and outlets missing from a sheet are left alone, not archived — a
// tab the client trimmed for one fixture shouldn't delete the rest.
export function MenuImport({ venueId, sections, products, outlets, sets, ranges, defaultSetId }) {
  const supabase = createClient();
  const router = useRouter();

  const [workbook, setWorkbook] = useState(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [targetSet, setTargetSet] = useState(defaultSetId || 'new');
  const [newSetName, setNewSetName] = useState('');
  const [useKey, setUseKey] = useState(true);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState('');

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setDone('');
    setWorkbook(null);
    setReading(true);
    setFileName(file.name);
    const body = new FormData();
    body.append('file', file);
    try {
      const res = await fetch('/api/menus/read-workbook', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
      setWorkbook(json);
      setSheetName(defaultSheet(json.rangeSheets));
    } catch (err) {
      setError(err.message);
    } finally {
      setReading(false);
      e.target.value = '';
    }
  }

  const sheet = workbook?.rangeSheets.find((s) => s.name === sheetName) || null;
  const key = useKey ? workbook?.key || null : null;

  const plan = useMemo(
    () => (workbook ? buildImportPlan({ sheet, key, sections, products, outlets, ranges, targetSet }) : null),
    [workbook, sheet, key, sections, products, outlets, ranges, targetSet]
  );

  async function apply() {
    if (!plan) return;
    setApplying(true);
    setError('');
    setDone('');
    try {
      await applyImportPlan(supabase, venueId, plan, {
        targetSet,
        newSetName: newSetName.trim() || sheet?.name || 'Imported',
        setCount: sets.length,
      });
      setDone(`Imported ${fileName}${sheet ? ` (${sheet.name})` : ''}.`);
      setWorkbook(null);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }

  const nothingToDo = plan && !plan.hasChanges && !(sheet && targetSet === 'new');

  return (
    <div className="panel" style={{ padding: '16px' }}>
      <h3 style={{ marginTop: 0 }}>Import from a spreadsheet</h3>
      <p className="hint">
        Upload the client&apos;s range sheet (the &ldquo;Products by area&rdquo; layout) or Linney&apos;s
        master schedule (the one with a KEY tab). You&apos;ll see what would change before anything is saved.
      </p>
      <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
        {reading ? 'Reading…' : 'Choose .xlsx file'}
        <input type="file" accept=".xlsx" onChange={onFile} disabled={reading || applying} style={{ display: 'none' }} />
      </label>
      {fileName && !reading && <span className="hint" style={{ marginLeft: 10 }}>{fileName}</span>}
      {error && <p className="error-text">{error}</p>}
      {done && <p className="success-text" style={{ color: 'var(--success)' }}>{done}</p>}

      {workbook && (
        <div className="menu-import">
          {workbook.rangeSheets.length > 0 && (
            <div className="filter-row">
              <label>
                Range sheet{' '}
                <select value={sheetName} onChange={(e) => setSheetName(e.target.value)}>
                  {workbook.rangeSheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}{s.hidden ? ' (hidden tab)' : ''} — {s.outlets.length} outlets, {s.products.length} products
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Into menu set{' '}
                <select value={targetSet} onChange={(e) => setTargetSet(e.target.value)}>
                  {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="new">A new menu set…</option>
                </select>
              </label>
              {targetSet === 'new' && (
                <input
                  type="text"
                  placeholder={sheet?.name || 'Menu set name'}
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  aria-label="New menu set name"
                />
              )}
            </div>
          )}
          {workbook.key && (
            <label className="menu-import-check">
              <input type="checkbox" checked={useKey} onChange={(e) => setUseKey(e.target.checked)} />
              Use the &ldquo;{workbook.key.name}&rdquo; tab for store codes, screen counts and current schedules
              ({workbook.key.rows.length} kiosks)
            </label>
          )}
          {workbook.rangeSheets.length === 0 && (
            <p className="hint">No range sheet in this workbook — only the schedule KEY will be applied.</p>
          )}

          {plan && <PlanPreview plan={plan} setName={targetSet === 'new' ? null : sets.find((s) => s.id === targetSet)?.name} />}

          <div className="toolbar" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={apply} disabled={applying || nothingToDo}>
              {applying ? 'Importing…' : nothingToDo ? 'Nothing to change' : 'Apply import'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setWorkbook(null)} disabled={applying}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanPreview({ plan, setName }) {
  const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return (
    <div className="menu-plan">
      <ul>
        {plan.sheet && (
          <>
            <li>{n(plan.newSections.length, 'new section')}{plan.newSections.length ? `: ${plan.newSections.join(', ')}` : ''}</li>
            <li>
              {n(plan.newProducts.length, 'new product')}
              {plan.newProducts.length ? `: ${plan.newProducts.map((p) => p.name).join(', ')}` : ''}
            </li>
            {plan.productUpdates.length > 0 && (
              <li>
                {n(plan.productUpdates.length, 'product')} with a new price or note:{' '}
                {plan.productUpdates.map((u) => `${u.label} (${u.what})`).join('; ')}
              </li>
            )}
            {plan.productsNotOnSheet.length > 0 && (
              <li className="hint">
                {n(plan.productsNotOnSheet.length, 'product')} in the venue aren&apos;t on this sheet and will be left as they are:{' '}
                {plan.productsNotOnSheet.map((p) => p.name).join(', ')}
              </li>
            )}
            <li>{n(plan.newOutlets.length, 'new outlet')}{plan.newOutlets.length ? `: ${plan.newOutlets.map((o) => o.name).join(', ')}` : ''}</li>
            {plan.outletUpdates.length > 0 && <li>{n(plan.outletUpdates.length, 'outlet')} with a changed menu tier, type or screen note</li>}
            <li>
              {n(plan.pairs.length, 'tick')} into {setName ? <strong>{setName}</strong> : 'a new menu set'}
              {setName && (plan.rangeChanges.length
                ? ` — ${n(plan.rangeChanges.length, 'outlet')} change from what's saved now:`
                : ' — the same as what’s saved now.')}
            </li>
          </>
        )}
        {plan.key && (
          <li>
            Master schedule: {n(plan.keyUpdates.length, 'outlet')} get a store code, screen count or schedule update
            {plan.keyUnmatched.length > 0 && (
              <span className="menu-warn">
                {' '}· {n(plan.keyUnmatched.length, 'kiosk')} couldn&apos;t be matched to an outlet and will be skipped:{' '}
                {plan.keyUnmatched.join(', ')}
              </span>
            )}
          </li>
        )}
        {plan.warnings.map((w) => <li key={w} className="menu-warn">{w}</li>)}
      </ul>

      {plan.rangeChanges.length > 0 && (
        <ul className="menu-diff-list">
          {plan.rangeChanges.map((d) => (
            <li key={d.outlet}>
              <strong>{d.outlet}</strong>
              {d.added.length > 0 && <span className="menu-diff-add"> + {d.added.join(', ')}</span>}
              {d.removed.length > 0 && <span className="menu-diff-remove"> − {d.removed.join(', ')}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The client keeps old tabs and adds new ones to the right, and a workbook can
// hold a smaller sheet for something else (Man United's has Hospitality). So
// default to the right-most visible tab covering the most outlets.
function defaultSheet(sheets) {
  const visible = sheets.filter((s) => !s.hidden);
  const pool = visible.length ? visible : sheets;
  if (!pool.length) return '';
  const most = Math.max(...pool.map((s) => s.outlets.length));
  return pool.filter((s) => s.outlets.length === most).pop().name;
}
