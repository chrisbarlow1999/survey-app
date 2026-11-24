'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { logAdminAction } from '../lib/logAdminAction';
import { slugify } from '../lib/projectStatus';
import { CUSTOM_SCREEN_KEY, OTHER_MOUNT } from '../lib/hardware';
import { resetHardwareCache } from '../lib/useHardware';

// Admin → Hardware (migration 048). Screens and mounts offered by the survey
// forms. Items are retired rather than deleted, and keys never change, because
// old surveys store the key — see the top of 048_hardware.sql.

const COLS = 'id, kind, key, label, model, width_mm, height_mm, active, position';

function byPosition(a, b) {
  return (a.position - b.position) || a.label.localeCompare(b.label);
}

function toInt(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Math.round(Number(s));
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function priceItemName(kind, label, model) {
  if (kind === 'mount') return label;
  return model ? `${model} ${label} screen` : `${label} screen`;
}

export function HardwareManagementPanel({ initialItems }) {
  const supabase = createClient();
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState(false);

  function changed(next) {
    setItems(next);
    resetHardwareCache();
  }

  async function add(kind, fields) {
    const label = fields.label.trim();
    const list = items.filter((i) => i.kind === kind);

    let key;
    if (kind === 'mount') {
      key = label;
      if (label.toLowerCase() === OTHER_MOUNT.toLowerCase()) {
        return `"${OTHER_MOUNT}" is always offered at the end of the list already.`;
      }
      if (list.some((i) => i.key.toLowerCase() === key.toLowerCase())) {
        return `There's already a mount called "${label}". If it's retired, restore it instead.`;
      }
    } else {
      // A readable key that's never reused — old surveys may still hold a retired one.
      const base = slugify(label.replace(/"/g, '')) || 'screen';
      key = base;
      for (let n = 2; list.some((i) => i.key === key); n += 1) key = `${base}-${n}`;
    }

    const position = list.reduce((m, i) => Math.max(m, i.position < 1000 ? i.position : 0), 0) + 10;
    setBusy(true);
    const { data, error } = await supabase
      .from('hardware_items')
      .insert({ kind, key, label, model: fields.model || null, width_mm: fields.width_mm ?? null, height_mm: fields.height_mm ?? null, position })
      .select(COLS)
      .single();
    if (error) {
      setBusy(false);
      return 'Could not add that item.';
    }

    // Give it a line in the cost-sheet catalogue so sheets seeded from a survey
    // pick it up. Needs a price setting there; an existing line is left alone.
    await supabase
      .from('price_items')
      .upsert(
        { name: priceItemName(kind, label, fields.model), unit: 'each', match_key: `${kind}:${key}` },
        { onConflict: 'match_key', ignoreDuplicates: true }
      );

    setBusy(false);
    changed([...items, data]);
    logAdminAction(supabase, 'create_hardware', `${kind === 'screen' ? 'Screen' : 'Mount'} · ${label}`);
    return null;
  }

  async function save(item, patch, actionDetails) {
    setBusy(true);
    const { error } = await supabase.from('hardware_items').update(patch).eq('id', item.id);
    setBusy(false);
    if (error) {
      alert('Could not save that change.');
      return false;
    }
    changed(items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    if (actionDetails) logAdminAction(supabase, actionDetails.action, actionDetails.target, actionDetails.details);
    return true;
  }

  async function move(item, dir) {
    const list = items.filter((i) => i.kind === item.kind && i.key !== CUSTOM_SCREEN_KEY).sort(byPosition);
    const idx = list.findIndex((i) => i.id === item.id);
    const other = list[idx + dir];
    if (!other) return;
    // Renumber the whole list so ties can't make a swap a no-op.
    const reordered = [...list];
    reordered[idx] = other;
    reordered[idx + dir] = item;
    const updates = reordered.map((i, n) => ({ id: i.id, position: (n + 1) * 10 })).filter((u) => items.find((i) => i.id === u.id).position !== u.position);
    setBusy(true);
    const results = await Promise.all(updates.map((u) => supabase.from('hardware_items').update({ position: u.position }).eq('id', u.id)));
    setBusy(false);
    if (results.some((r) => r.error)) {
      alert('Could not reorder — refresh the page and try again.');
      return;
    }
    const pos = new Map(updates.map((u) => [u.id, u.position]));
    changed(items.map((i) => (pos.has(i.id) ? { ...i, position: pos.get(i.id) } : i)));
  }

  const screens = items.filter((i) => i.kind === 'screen').sort(byPosition);
  const mounts = items.filter((i) => i.kind === 'mount').sort(byPosition);

  return (
    <div>
      <h3 className="hardware-heading">Screens</h3>
      <div className="client-list">
        {screens.map((s) => (
          <ScreenRow key={s.id} item={s} busy={busy} onSave={save} onMove={move}
            first={s === screens[0]} last={s === screens.filter((x) => x.key !== CUSTOM_SCREEN_KEY).at(-1)} />
        ))}
      </div>
      <AddScreenForm busy={busy} onAdd={(f) => add('screen', f)} />

      <h3 className="hardware-heading">Mounts</h3>
      <div className="client-list">
        {mounts.map((m) => (
          <MountRow key={m.id} item={m} busy={busy} onSave={save} onMove={move}
            first={m === mounts[0]} last={m === mounts.at(-1)} />
        ))}
        <div className="client-row hardware-fixed">
          <span className="client-row-name">{OTHER_MOUNT}</span>
          <span className="client-row-email">Always last — lets the engineer type a mount that isn&apos;t listed.</span>
        </div>
      </div>
      <AddMountForm busy={busy} onAdd={(f) => add('mount', f)} />
    </div>
  );
}

function StatusBadge({ active }) {
  return (
    <span className={`client-badge ${active ? '' : 'archived-badge'}`} style={{ marginLeft: 8 }}>
      {active ? 'In use' : 'Retired'}
    </span>
  );
}

function RowActions({ item, busy, onSave, onMove, first, last, fixed, onEdit }) {
  const kindLabel = item.kind === 'screen' ? 'Screen' : 'Mount';
  return (
    <>
      {!fixed && (
        <>
          <button className="btn btn-ghost hardware-move" type="button" disabled={busy || first} onClick={() => onMove(item, -1)} aria-label={`Move ${item.label} up`}>↑</button>
          <button className="btn btn-ghost hardware-move" type="button" disabled={busy || last} onClick={() => onMove(item, 1)} aria-label={`Move ${item.label} down`}>↓</button>
        </>
      )}
      {onEdit && <button className="btn btn-ghost" type="button" disabled={busy} onClick={onEdit}>Edit</button>}
      <button
        className="btn btn-ghost"
        type="button"
        disabled={busy}
        onClick={() => {
          if (item.active && !confirm(`Retire "${item.label}"? It stops appearing on the survey forms. Surveys that already use it are unaffected, and you can restore it any time.`)) return;
          onSave(item, { active: !item.active }, {
            action: item.active ? 'retire_hardware' : 'restore_hardware',
            target: `${kindLabel} · ${item.label}`,
          });
        }}
      >
        {item.active ? 'Retire' : 'Restore'}
      </button>
    </>
  );
}

function ScreenRow({ item, busy, onSave, onMove, first, last }) {
  const custom = item.key === CUSTOM_SCREEN_KEY;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(null);

  function startEdit() {
    setF({ label: item.label, model: item.model || '', width_mm: item.width_mm ?? '', height_mm: item.height_mm ?? '' });
    setEditing(true);
  }

  async function submit(e) {
    e.preventDefault();
    const label = f.label.trim();
    const w = custom ? null : toInt(f.width_mm);
    const h = custom ? null : toInt(f.height_mm);
    if (!label) return alert('A screen needs a name.');
    if (Number.isNaN(w) || Number.isNaN(h) || (w ?? 0) > 20000 || (h ?? 0) > 20000) return alert('Width and height must be whole millimetres (or left blank).');
    const patch = { label, model: f.model.trim() || null, width_mm: w, height_mm: h };
    const ok = await onSave(item, patch, {
      action: 'update_hardware',
      target: `Screen · ${label}`,
      details: label !== item.label ? { from: item.label } : {},
    });
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <form className="client-row" onSubmit={submit}>
        <div className="hardware-fields">
          <label>Name<input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} maxLength={80} autoFocus /></label>
          <label>Model<input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} maxLength={80} /></label>
          {!custom && (
            <>
              <label>Width (mm)<input type="number" min="1" max="20000" value={f.width_mm} onChange={(e) => setF({ ...f, width_mm: e.target.value })} /></label>
              <label>Height (mm)<input type="number" min="1" max="20000" value={f.height_mm} onChange={(e) => setF({ ...f, height_mm: e.target.value })} /></label>
            </>
          )}
        </div>
        <button className="btn btn-ghost" type="submit" disabled={busy}>Save</button>
        <button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
      </form>
    );
  }

  const dims = custom
    ? 'Size typed in on the survey'
    : (item.width_mm && item.height_mm ? `${item.width_mm} × ${item.height_mm} mm` : 'No dimensions — no scale drawing');

  return (
    <div className={`client-row${item.active ? '' : ' hardware-retired'}`}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="client-row-name">{item.label}</span>
        <StatusBadge active={item.active} />
        <div className="client-row-email">{[item.model, dims].filter(Boolean).join(' · ')}</div>
      </div>
      <RowActions item={item} busy={busy} onSave={onSave} onMove={onMove} first={first} last={last} fixed={custom} onEdit={startEdit} />
    </div>
  );
}

function MountRow({ item, busy, onSave, onMove, first, last }) {
  return (
    <div className={`client-row${item.active ? '' : ' hardware-retired'}`}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="client-row-name">{item.label}</span>
        <StatusBadge active={item.active} />
      </div>
      <RowActions item={item} busy={busy} onSave={onSave} onMove={onMove} first={first} last={last} />
    </div>
  );
}

function AddScreenForm({ busy, onAdd }) {
  const blank = { label: '', model: '', width_mm: '', height_mm: '' };
  const [f, setF] = useState(blank);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    const label = f.label.trim();
    const w = toInt(f.width_mm);
    const h = toInt(f.height_mm);
    if (!label) return setError('Give the screen a name, e.g. 86".');
    if (Number.isNaN(w) || Number.isNaN(h) || (w ?? 0) > 20000 || (h ?? 0) > 20000) return setError('Width and height must be whole millimetres (or left blank).');
    const err = await onAdd({ label, model: f.model.trim() || null, width_mm: w, height_mm: h });
    if (err) setError(err);
    else setF(blank);
  }

  return (
    <form className="hardware-add" onSubmit={submit}>
      <div className="hardware-fields">
        <label>Name<input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder='e.g. 86"' maxLength={80} /></label>
        <label>Model<input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder="e.g. QM86C" maxLength={80} /></label>
        <label>Width (mm)<input type="number" min="1" max="20000" value={f.width_mm} onChange={(e) => setF({ ...f, width_mm: e.target.value })} placeholder="Landscape" /></label>
        <label>Height (mm)<input type="number" min="1" max="20000" value={f.height_mm} onChange={(e) => setF({ ...f, height_mm: e.target.value })} placeholder="Landscape" /></label>
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy || !f.label.trim()}>Add Screen</button>
      {error && <p className="error-text" style={{ flexBasis: '100%' }}>{error}</p>}
    </form>
  );
}

function AddMountForm({ busy, onAdd }) {
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    const err = await onAdd({ label });
    if (err) setError(err);
    else setLabel('');
  }

  return (
    <form className="hardware-add" onSubmit={submit}>
      <div className="hardware-fields">
        <label>Name<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Floor Stand" maxLength={80} /></label>
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy || !label.trim()}>Add Mount</button>
      {error && <p className="error-text" style={{ flexBasis: '100%' }}>{error}</p>}
    </form>
  );
}
