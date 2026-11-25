'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { logAdminAction } from '../lib/logAdminAction';
import { OTHER_COMPANY } from '../lib/engineerCompanies';
import { resetEngineerCompaniesCache } from '../lib/useEngineerCompanies';

// Setup → Engineer Companies (migration 050). Firms are retired rather than
// deleted, and renamed through rename_engineer_company() so every record and
// booking that names the firm is renamed with it.

function byPosition(a, b) {
  return (a.position - b.position) || a.name.localeCompare(b.name);
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function EngineerCompanyManagementPanel({ initialCompanies }) {
  const supabase = createClient();
  const [companies, setCompanies] = useState(initialCompanies);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const list = [...companies].sort(byPosition);

  function changed(next) {
    setCompanies(next);
    resetEngineerCompaniesCache();
  }

  function clash(name, exceptId) {
    const n = name.trim().toLowerCase();
    return companies.some((c) => c.id !== exceptId && c.name.trim().toLowerCase() === n);
  }

  async function add(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    const name = newName.trim();
    if (!name) return;
    if (name.toLowerCase() === OTHER_COMPANY.toLowerCase()) {
      setError(`"${OTHER_COMPANY}" is always offered on the forms already.`);
      return;
    }
    if (clash(name)) {
      setError(`There's already a firm called "${name}". If it's retired, restore it instead.`);
      return;
    }
    const position = companies.reduce((m, c) => Math.max(m, c.position), 0) + 10;
    setBusy(true);
    const { data, error: insErr } = await supabase
      .from('engineer_companies')
      .insert({ name, position })
      .select('id, name, active, position')
      .single();
    setBusy(false);
    if (insErr) {
      setError(insErr.code === '23505' ? `There's already a firm called "${name}".` : 'Could not add that firm.');
      return;
    }
    changed([...companies, data]);
    setNewName('');
    logAdminAction(supabase, 'create_engineer_company', name);
  }

  async function rename(c) {
    setError('');
    setNotice('');
    const name = (window.prompt(`Rename "${c.name}"?\n\nEvery survey, install, visit and install booking that names this firm will be renamed too.`, c.name) || '').trim();
    if (!name || name === c.name) return;
    if (name.toLowerCase() === OTHER_COMPANY.toLowerCase()) {
      setError(`A firm can't be called "${OTHER_COMPANY}".`);
      return;
    }
    if (clash(name, c.id)) {
      setError(`There's already a firm called "${name}". Retire one of them instead.`);
      return;
    }
    setBusy(true);
    const { data, error: rpcErr } = await supabase.rpc('rename_engineer_company', { p_id: c.id, p_name: name });
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.code === '23505' ? `There's already a firm called "${name}".` : 'Could not rename that firm.');
      return;
    }
    changed(companies.map((x) => (x.id === c.id ? { ...x, name } : x)));
    const r = data || {};
    const records = (r.surveys || 0) + (r.installations || 0) + (r.visits || 0);
    const bookings = (r.sites || 0) + (r.projects || 0);
    setNotice(`Renamed to "${name}" — ${plural(records, 'record')} and ${plural(bookings, 'install booking')} updated.`);
    logAdminAction(supabase, 'rename_engineer_company', name, { from: c.name });
  }

  async function toggle(c) {
    setError('');
    setNotice('');
    if (c.active && !confirm(`Retire "${c.name}"? It stops appearing on the forms and as an install team. Records that already name it keep it, and you can restore it any time.`)) return;
    setBusy(true);
    const { error: updErr } = await supabase.from('engineer_companies').update({ active: !c.active }).eq('id', c.id);
    setBusy(false);
    if (updErr) {
      setError('Could not change that firm.');
      return;
    }
    changed(companies.map((x) => (x.id === c.id ? { ...x, active: !c.active } : x)));
    logAdminAction(supabase, c.active ? 'retire_engineer_company' : 'restore_engineer_company', c.name);
  }

  async function move(c, dir) {
    const idx = list.findIndex((x) => x.id === c.id);
    const other = list[idx + dir];
    if (!other) return;
    const reordered = [...list];
    reordered[idx] = other;
    reordered[idx + dir] = c;
    const updates = reordered
      .map((x, n) => ({ id: x.id, position: (n + 1) * 10 }))
      .filter((u) => companies.find((x) => x.id === u.id).position !== u.position);
    setBusy(true);
    const results = await Promise.all(updates.map((u) => supabase.from('engineer_companies').update({ position: u.position }).eq('id', u.id)));
    setBusy(false);
    if (results.some((r) => r.error)) {
      setError('Could not reorder — refresh the page and try again.');
      return;
    }
    const pos = new Map(updates.map((u) => [u.id, u.position]));
    changed(companies.map((x) => (pos.has(x.id) ? { ...x, position: pos.get(x.id) } : x)));
  }

  return (
    <div>
      {error && <p className="error-text">{error}</p>}
      {notice && <p className="hint" style={{ color: 'var(--success)' }}>{notice}</p>}

      <div className="client-list">
        {list.map((c, i) => (
          <div key={c.id} className={`client-row${c.active ? '' : ' hardware-retired'}`}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="client-row-name">{c.name}</span>
              <span className={`client-badge ${c.active ? '' : 'archived-badge'}`} style={{ marginLeft: 8 }}>
                {c.active ? 'In use' : 'Retired'}
              </span>
            </div>
            <button className="btn btn-ghost hardware-move" type="button" disabled={busy || i === 0} onClick={() => move(c, -1)} aria-label={`Move ${c.name} up`}>↑</button>
            <button className="btn btn-ghost hardware-move" type="button" disabled={busy || i === list.length - 1} onClick={() => move(c, 1)} aria-label={`Move ${c.name} down`}>↓</button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => rename(c)}>Rename</button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => toggle(c)}>{c.active ? 'Retire' : 'Restore'}</button>
          </div>
        ))}
        <div className="client-row hardware-fixed">
          <span className="client-row-name">{OTHER_COMPANY}</span>
          <span className="client-row-email">Always last on the engineer forms — lets the engineer type a firm that isn&apos;t listed.</span>
        </div>
      </div>

      <form className="hardware-add" onSubmit={add}>
        <div className="hardware-fields">
          <label>Firm name<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. B&B" maxLength={80} /></label>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy || !newName.trim()}>Add Firm</button>
      </form>
    </div>
  );
}
