'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';
import { buildImportPlan, applyImportPlan } from '../../lib/menuImport';

// Load a venue from the spreadsheets it runs on today, in three steps with a
// running account of what would change beside them:
//
//   1 Spreadsheet   the file, and which tab in it
//   2 Layout        which row holds the outlet names, which column the price —
//                   guessed from the shape of the sheet, corrected here, and
//                   saved against the client so the next import is one click
//   3 Where it goes which menu set the ticks land in
//
// Nothing is written until Apply. The panel is the useful part on a re-import:
// it lists exactly which outlets gained or lost which products since last
// time, which is the comparison that takes hours by eye today.
//
// Products and outlets missing from a sheet are left alone, not archived — a
// tab the client trimmed for one fixture shouldn't delete the rest.
export function MenuImport({
  venueId, clientId, clientName, sections, products, outlets, sets, ranges, defaultSetId, profiles = [],
}) {
  const supabase = createClient();
  const router = useRouter();

  const [file, setFile] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [mapping, setMapping] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [profileId, setProfileId] = useState('');
  const [profileName, setProfileName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [targetSet, setTargetSet] = useState(defaultSetId || 'new');
  const [newSetName, setNewSetName] = useState('');
  const [useKey, setUseKey] = useState(true);
  const [applying, setApplying] = useState(false);

  const sheet = workbook?.rangeSheets.find((s) => s.name === sheetName) || null;
  const key = useKey ? workbook?.key || null : null;

  async function read(theFile, mappings, nextSheet) {
    setError('');
    setDone('');
    setReading(true);
    const body = new FormData();
    body.append('file', theFile);
    if (mappings) body.append('mappings', JSON.stringify(mappings));
    try {
      const res = await fetch('/api/menus/read-workbook', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
      setWorkbook(json);
      const chosen = json.rangeSheets.find((s) => s.name === nextSheet)?.name || defaultSheet(json.rangeSheets);
      setSheetName(chosen);
      setMapping(json.rangeSheets.find((s) => s.name === chosen)?.mapping || null);
      setDirty(false);
      return json;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setReading(false);
    }
  }

  async function onFile(e) {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setFile(picked);
    setWorkbook(null);
    const saved = profiles.find((p) => p.id === profileId);
    await read(picked, saved ? { '*': saved.mapping } : null);
  }

  function pickSheet(name) {
    setSheetName(name);
    setMapping(workbook?.rangeSheets.find((s) => s.name === name)?.mapping || null);
    setDirty(false);
  }

  function editMapping(patch) {
    setMapping((m) => ({ ...m, ...patch }));
    setDirty(true);
  }

  function setAttrRole(row, role) {
    setMapping((m) => ({ ...m, attrRows: (m.attrRows || []).map((a) => (a.row === row ? { ...a, role } : a)) }));
    setDirty(true);
  }

  async function useProfile(id) {
    setProfileId(id);
    const saved = profiles.find((p) => p.id === id);
    if (file) await read(file, saved ? { '*': saved.mapping } : null, sheetName);
  }

  async function saveProfile() {
    const name = profileName.trim();
    if (!name || !mapping) return;
    setSavingProfile(true);
    setError('');
    const existing = profiles.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    const row = { client_id: clientId, name, sheet_hint: sheetName, mapping, updated_at: new Date().toISOString() };
    const { error: err } = existing
      ? await supabase.from('menu_import_profiles').update(row).eq('id', existing.id)
      : await supabase.from('menu_import_profiles').insert(row);
    setSavingProfile(false);
    if (err) {
      setError(`Could not save that layout: ${err.message}`);
      return;
    }
    setDone(`Saved “${name}” as a layout for ${clientName}. The next import of this sheet starts from it.`);
    setProfileName('');
    router.refresh();
  }

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
      setDone(`Imported ${file?.name || 'that workbook'}${sheet ? ` (${sheet.name})` : ''}.`);
      setWorkbook(null);
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }

  const nothingToDo = plan && !plan.hasChanges && !(sheet && targetSet === 'new');

  return (
    <div className="step-flow">
      <div className="step-col">
        <Step n="1" title="Spreadsheet" note={file ? file.name : 'The client’s range sheet, or Linney’s master schedule'}>
          <div className="filter-row" style={{ marginTop: 0 }}>
            <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
              {reading ? 'Reading…' : file ? 'Choose a different file' : 'Choose .xlsx file'}
              <input type="file" accept=".xlsx" onChange={onFile} disabled={reading || applying} style={{ display: 'none' }} />
            </label>
            {profiles.length > 0 && (
              <label>
                Saved layout{' '}
                <select value={profileId} onChange={(e) => useProfile(e.target.value)} disabled={reading}>
                  <option value="">Work it out from the sheet</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
          </div>

          {workbook && workbook.rangeSheets.length > 0 && (
            <label className="menu-import-field">
              Tab to read{' '}
              <select value={sheetName} onChange={(e) => pickSheet(e.target.value)}>
                {workbook.rangeSheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}{s.hidden ? ' (hidden tab)' : ''} — {s.outlets.length} outlets, {s.products.length} products
                  </option>
                ))}
              </select>
            </label>
          )}
          {workbook && workbook.rangeSheets.length === 0 && (
            <p className="hint">No range sheet in this workbook — only the schedule will be applied.</p>
          )}
          {workbook?.key && (
            <label className="menu-import-check">
              <input type="checkbox" checked={useKey} onChange={(e) => setUseKey(e.target.checked)} />
              Use the “{workbook.key.name}” tab for store codes, screen counts and current schedules
              ({workbook.key.rows.length} kiosks)
            </label>
          )}
          {error && <p className="error-text">{error}</p>}
          {done && <p className="hint" style={{ color: 'var(--success)' }}>{done}</p>}
        </Step>

        <Step
          n="2"
          title="Layout"
          note={sheet ? `${sheet.found?.outlets ?? sheet.outlets.length} outlets across, ${sheet.products.length} products down` : 'Worked out from the sheet once a file is chosen'}
          muted={!sheet}
        >
          {!sheet ? (
            <p className="hint" style={{ margin: 0 }}>
              Nothing to set up yet. The importer finds the block of ticks, then guesses which row holds the
              outlet names and which columns hold the product, its price and its detail line. Check the guess here.
            </p>
          ) : (
            <MappingEditor
              sheet={sheet}
              mapping={mapping}
              onChange={editMapping}
              onAttrRole={setAttrRole}
              dirty={dirty}
              reading={reading}
              onReread={() => read(file, { [sheetName]: mapping }, sheetName)}
              clientName={clientName}
              profileName={profileName}
              setProfileName={setProfileName}
              onSaveProfile={saveProfile}
              savingProfile={savingProfile}
            />
          )}
        </Step>

        <Step n="3" title="Where it goes" note={sheet ? 'The ticks replace what this menu set holds now' : 'Pick a file first'} muted={!sheet}>
          {sheet ? (
            <div className="filter-row" style={{ marginTop: 0 }}>
              <label>
                Menu set{' '}
                <select value={targetSet} onChange={(e) => setTargetSet(e.target.value)}>
                  {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="new">A new menu set…</option>
                </select>
              </label>
              {targetSet === 'new' && (
                <input
                  type="text"
                  placeholder={sheet.name || 'Menu set name'}
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  aria-label="New menu set name"
                />
              )}
            </div>
          ) : (
            <p className="hint" style={{ margin: 0 }}>A range sheet's ticks land in one menu set — Premier League, UEFA, and so on.</p>
          )}
        </Step>
      </div>

      <aside className="step-aside" aria-live="polite">
        <h3 style={{ marginTop: 0 }}>What this changes</h3>
        {!plan && (
          <p className="hint" style={{ marginTop: 0 }}>
            Choose a spreadsheet and this panel lists every product, outlet and tick it would change —
            before anything is saved.
          </p>
        )}
        {plan && (
          <>
            <div className="step-stats">
              <div><b>{plan.newProducts.length}</b><span>new products</span></div>
              <div><b>{plan.newOutlets.length}</b><span>new outlets</span></div>
              <div><b>{plan.rangeChanges.length}</b><span>outlets change</span></div>
            </div>
            <PlanPreview plan={plan} setName={targetSet === 'new' ? null : sets.find((s) => s.id === targetSet)?.name} />
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-primary" onClick={apply} disabled={applying || nothingToDo || dirty}>
                {applying ? 'Importing…' : dirty ? 'Re-read the sheet first' : nothingToDo ? 'Nothing to change' : 'Apply import'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setWorkbook(null); setFile(null); }} disabled={applying}>
                Cancel
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Step({ n, title, note, muted, children }) {
  return (
    <section className={`step-card${muted ? ' step-muted' : ''}`}>
      <div className="step-head">
        <h3><span className="step-num">{n}</span>{title}</h3>
        {note && <span className="hint" style={{ margin: 0 }}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

// Which row holds what, which column holds what. Every control is a list of
// the sheet's own rows and columns with a sample of what's in them, so it can
// be answered by looking at the spreadsheet rather than counting letters.
function MappingEditor({
  sheet, mapping, onChange, onAttrRole, dirty, reading, onReread,
  clientName, profileName, setProfileName, onSaveProfile, savingProfile,
}) {
  const [showSheet, setShowSheet] = useState(false);
  if (!mapping) return null;
  const preview = sheet.preview;
  const sample = (col) => {
    const i = preview.columns.indexOf(col);
    if (i < 0) return '';
    const values = preview.rows
      .slice(mapping.firstProductRow - 1, mapping.firstProductRow + 6)
      .map((r) => r[i])
      .filter((v) => v && v !== '·' && v !== '✓');
    return values.slice(0, 2).join(', ');
  };
  const colLabel = (col) => {
    const letter = columnLetter(col);
    const s = sample(col);
    return s ? `${letter} — ${s}` : `Column ${letter}`;
  };
  // A row above the grid is described by what sits over the OUTLETS, not by a
  // note the client left in a label column.
  const outletIndexes = (preview.outletColumns || []).map((c) => preview.columns.indexOf(c)).filter((i) => i >= 0);
  const rowLabel = (row) => {
    const cells = preview.rows[row - 1] || [];
    const source = outletIndexes.length ? outletIndexes.map((i) => cells[i]) : cells;
    const values = source.filter((v) => v && v !== '·' && v !== '✓');
    return values.length ? `Row ${row} — ${values.slice(0, 3).join(', ')}` : `Row ${row}`;
  };

  const labelCols = preview.columns.filter((c) => c < (mapping.headerRow ? Math.max(mapping.nameCol, mapping.priceCol || 0, mapping.tierNoteCol || 0) + 4 : 8));
  const rowsAbove = [];
  for (let r = 1; r < mapping.firstProductRow; r++) rowsAbove.push(r);

  return (
    <>
      <div className="menu-map-grid">
        <label>
          Outlet names are on
          <select value={mapping.headerRow} onChange={(e) => onChange({ headerRow: Number(e.target.value) })}>
            {rowsAbove.map((r) => <option key={r} value={r}>{rowLabel(r)}</option>)}
          </select>
        </label>
        <label>
          Product name column
          <select value={mapping.nameCol} onChange={(e) => onChange({ nameCol: Number(e.target.value) })}>
            {labelCols.map((c) => <option key={c} value={c}>{colLabel(c)}</option>)}
          </select>
        </label>
        <label>
          Price column
          <select value={mapping.priceCol || ''} onChange={(e) => onChange({ priceCol: e.target.value ? Number(e.target.value) : null })}>
            <option value="">No prices on this sheet</option>
            {labelCols.map((c) => <option key={c} value={c}>{colLabel(c)}</option>)}
          </select>
        </label>
        <label>
          Detail line (ABV, size)
          <select
            value={mapping.detailMode}
            onChange={(e) => onChange({ detailMode: e.target.value, detailCol: e.target.value === 'column' ? mapping.detailCol || mapping.nameCol + 1 : null })}
          >
            <option value="below">The line under each product</option>
            <option value="column">A column of its own</option>
            <option value="none">No detail line</option>
          </select>
        </label>
        {mapping.detailMode === 'column' && (
          <label>
            Detail column
            <select value={mapping.detailCol || ''} onChange={(e) => onChange({ detailCol: Number(e.target.value) })}>
              {labelCols.map((c) => <option key={c} value={c}>{colLabel(c)}</option>)}
            </select>
          </label>
        )}
        <label>
          Sections come from
          <select
            value={mapping.sectionMode}
            onChange={(e) => onChange({ sectionMode: e.target.value, sectionCol: e.target.value === 'column' ? mapping.sectionCol || 1 : null })}
          >
            <option value="headings">Headings between the products</option>
            <option value="column">A column of its own</option>
          </select>
        </label>
        {mapping.sectionMode === 'column' && (
          <label>
            Section column
            <select value={mapping.sectionCol || ''} onChange={(e) => onChange({ sectionCol: Number(e.target.value) })}>
              {labelCols.map((c) => <option key={c} value={c}>{colLabel(c)}</option>)}
            </select>
          </label>
        )}
        <label>
          Qualifier column
          <select value={mapping.tierNoteCol || ''} onChange={(e) => onChange({ tierNoteCol: e.target.value ? Number(e.target.value) : null })}>
            <option value="">None</option>
            {labelCols.map((c) => <option key={c} value={c}>{colLabel(c)}</option>)}
          </select>
        </label>
      </div>

      {(mapping.attrRows || []).length > 0 && (
        <div className="menu-map-rows">
          <div className="meta" style={{ marginBottom: 4 }}>The rows between the outlet names and the first product:</div>
          {mapping.attrRows.map((a) => (
            <label key={a.row} className="menu-map-row">
              <span className="mono">Row {a.row}</span>
              <span className="meta">{a.sample}</span>
              <select value={a.role} onChange={(e) => onAttrRole(a.row, e.target.value)}>
                <option value="unassigned">Ignore</option>
                <option value="menu_tier">Menu tier</option>
                <option value="menu_type">Menu type</option>
                <option value="notes">Note</option>
                <option value="client_screens">Screen count</option>
              </select>
            </label>
          ))}
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-ghost" onClick={() => setShowSheet((v) => !v)}>
          {showSheet ? 'Hide the sheet' : 'Show the sheet'}
        </button>
        <button type="button" className={`btn ${dirty ? 'btn-primary' : 'btn-ghost'}`} onClick={onReread} disabled={!dirty || reading}>
          {reading ? 'Re-reading…' : dirty ? 'Re-read with these settings' : 'Read as shown'}
        </button>
        <input
          type="text"
          placeholder={`Save as a layout for ${clientName}`}
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          aria-label="Layout name"
          style={{ flex: '0 1 240px' }}
        />
        <button type="button" className="btn btn-ghost" onClick={onSaveProfile} disabled={!profileName.trim() || savingProfile}>
          {savingProfile ? 'Saving…' : 'Save layout'}
        </button>
      </div>

      {showSheet && (
        <div className="menu-map-preview">
          <table>
            <thead>
              <tr>
                <th />
                {preview.columns.map((c) => <th key={c}>{columnLetter(c)}</th>)}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, i) => {
                const rowNo = i + 1;
                const role = rowNo === mapping.headerRow ? 'names'
                  : (mapping.attrRows || []).find((a) => a.row === rowNo && a.role !== 'unassigned') ? 'attr'
                    : rowNo >= mapping.firstProductRow ? 'products' : '';
                return (
                  <tr key={rowNo} className={role ? `map-${role}` : ''}>
                    <th scope="row">{rowNo}</th>
                    {row.map((cell, j) => {
                      const col = preview.columns[j];
                      const hit = col === mapping.nameCol ? 'map-name'
                        : col === mapping.priceCol ? 'map-price'
                          : col === mapping.detailCol ? 'map-detail'
                            : col === mapping.sectionCol ? 'map-section'
                              : col === mapping.tierNoteCol ? 'map-qualifier' : '';
                      return <td key={col} className={hit}>{cell}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function columnLetter(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
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
