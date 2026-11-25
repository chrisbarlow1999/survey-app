'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { PROJECT_COLUMNS, DEFAULT_PROJECT_COLUMNS, resolveProjectColumns, projectColumn } from '../lib/projectColumns';

// "Columns" on Projects → Table: tick the columns you want, put them in order,
// save. Stored against the account (user_preferences, migration 053), so it
// follows the person to any device. "Project" is always shown first.
export function ProjectColumnPicker({ userId, prefs = {}, enabled = true }) {
  const supabase = createClient();
  const router = useRouter();
  const saved = resolveProjectColumns(prefs.projectTableColumns);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function start() {
    setChosen(saved);
    setError('');
    setOpen(true);
  }

  function toggle(id) {
    setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  function move(id, dir) {
    setChosen((list) => {
      const i = list.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save(ids) {
    if (!ids.length) {
      setError('Pick at least one column.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: upErr } = await supabase
      .from('user_preferences')
      .upsert(
        { profile_id: userId, prefs: { ...prefs, projectTableColumns: ids }, updated_at: new Date().toISOString() },
        { onConflict: 'profile_id' }
      );
    setBusy(false);
    if (upErr) {
      console.error(upErr);
      setError('Could not save your columns.');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!enabled) {
    return (
      <button className="btn btn-ghost" type="button" disabled title="Run migration 053_user_preferences.sql to choose columns">
        Columns
      </button>
    );
  }

  const others = PROJECT_COLUMNS.filter((c) => !chosen.includes(c.id));

  return (
    <div className="column-picker">
      <button className="btn btn-ghost" type="button" onClick={() => (open ? setOpen(false) : start())} aria-expanded={open}>
        Columns
      </button>
      {open && (
        <div className="column-picker-panel" role="dialog" aria-label="Choose table columns">
          <p className="hint" style={{ margin: '0 0 8px' }}>
            Tick the columns you want and use the arrows to order them. Saved to your account — only you see
            this layout. Project is always first.
          </p>

          <div className="column-picker-heading">Showing ({chosen.length})</div>
          <ul className="column-picker-list">
            {chosen.map((id, i) => {
              const c = projectColumn(id);
              return (
                <li key={id}>
                  <label>
                    <input type="checkbox" checked onChange={() => toggle(id)} />
                    {c.label}
                  </label>
                  <span className="column-picker-moves">
                    <button type="button" disabled={i === 0} onClick={() => move(id, -1)} aria-label={`Move ${c.label} left`}>↑</button>
                    <button type="button" disabled={i === chosen.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${c.label} right`}>↓</button>
                  </span>
                </li>
              );
            })}
          </ul>

          {others.length > 0 && (
            <>
              <div className="column-picker-heading">Available</div>
              <ul className="column-picker-list">
                {others.map((c) => (
                  <li key={c.id}>
                    <label>
                      <input type="checkbox" checked={false} onChange={() => toggle(c.id)} />
                      {c.label}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          {error && <p className="error-text" style={{ margin: '8px 0 0' }}>{error}</p>}
          <div className="column-picker-actions">
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => save(DEFAULT_PROJECT_COLUMNS)}>Reset to default</button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => save(chosen)}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
