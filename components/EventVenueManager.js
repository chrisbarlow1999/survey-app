'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { VENUE_KINDS } from '../lib/events';

// The watch list: the venues the weekly draft asks about.
//
// Kept deliberately small. It is not a list of every site — Compass alone has
// offices and universities that never have a dated event worth chasing artwork
// for. A short, curated list makes the question precise and the search cheap.
export function EventVenueManager({ venues, clients, canEdit }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ client_id: '', name: '', kind: 'Stadium', town: '', search_hint: '' });

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function add(e) {
    e.preventDefault();
    if (!form.client_id || !form.name.trim()) {
      setError('A venue needs a client and a name.');
      return;
    }
    setBusy('new');
    setError('');
    const { error: insErr } = await supabase.from('event_venues').insert({
      client_id: form.client_id,
      name: form.name.trim(),
      kind: form.kind || null,
      town: form.town.trim() || null,
      search_hint: form.search_hint.trim() || null,
    });
    setBusy(null);
    if (insErr) {
      console.error(insErr);
      // The unique index is per client, so the same venue name under two
      // clients is fine — this is the genuine duplicate case.
      setError(insErr.code === '23505'
        ? 'That venue is already on the list for this client.'
        : 'Could not add that venue.');
      return;
    }
    setForm({ client_id: form.client_id, name: '', kind: 'Stadium', town: '', search_hint: '' });
    router.refresh();
  }

  async function patch(venue, fields) {
    setBusy(venue.id);
    setError('');
    const { data, error: updErr } = await supabase
      .from('event_venues').update(fields).eq('id', venue.id).select('id');
    setBusy(null);
    if (updErr) {
      console.error(updErr);
      setError('Could not save that change.');
      return;
    }
    if (!data || data.length === 0) {
      setError('That change was refused — you may not have access to this venue.');
      return;
    }
    router.refresh();
  }

  const active = (venues || []).filter((v) => v.active);
  const archived = (venues || []).filter((v) => !v.active);

  return (
    <>
      {error && <p className="error-text">{error}</p>}

      {canEdit && (
        <div className="panel">
          <h2>Add a venue</h2>
          <p className="hint">
            The search hint is passed to the AI with the venue — competitions it hosts, or the page
            its fixtures live on. A good hint is the difference between finding the fixture list and
            finding nothing.
          </p>
          <form onSubmit={add}>
            <div className="field-row">
              <div className="field">
                <label className="req">Client</label>
                <select value={form.client_id} onChange={(e) => setField('client_id', e.target.value)}>
                  <option value="">Choose…</option>
                  {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 2, minWidth: 220 }}>
                <label className="req">Venue name</label>
                <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="e.g. Tottenham Hotspur Stadium" />
              </div>
              <div className="field">
                <label>Kind</label>
                <select value={form.kind} onChange={(e) => setField('kind', e.target.value)}>
                  {VENUE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Town</label>
                <input type="text" value={form.town} onChange={(e) => setField('town', e.target.value)} placeholder="e.g. London" />
              </div>
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: '1 1 100%' }}>
                <label>Search hint</label>
                <input type="text" value={form.search_hint} onChange={(e) => setField('search_hint', e.target.value)} placeholder="e.g. Premier League and NFL fixtures, also hosts concerts" />
              </div>
            </div>
            <div className="actions-row" style={{ marginBottom: 0 }}>
              <button className="btn btn-primary" type="submit" disabled={busy === 'new'}>
                {busy === 'new' ? 'Adding…' : 'Add venue'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="panel" style={{ padding: '12px 16px' }}>
        <h2>Watched venues <span className="panel-count">{active.length}</span></h2>
        {active.length === 0 && (
          <div className="empty-state">No venues watched yet. Add the first one above.</div>
        )}
        {active.map((v) => (
          <div className="event-row" key={v.id}>
            <div className="event-main">
              <div className="site">
                {v.name}
                {v.clients?.name ? <span className="client-badge">{v.clients.name}</span> : null}
                {v.kind ? <span className="client-badge">{v.kind}</span> : null}
              </div>
              <div className="meta">
                {v.town || 'No town set'}
                {v.search_hint ? ` · ${v.search_hint}` : ' · no search hint'}
              </div>
            </div>
            {canEdit && (
              <div className="event-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy === v.id}
                  onClick={() => patch(v, { active: false })}
                >
                  Stop watching
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <div className="panel" style={{ padding: '12px 16px' }}>
          <h2 style={{ fontSize: 15 }}>No longer watched <span className="panel-count">{archived.length}</span></h2>
          {archived.map((v) => (
            <div className="event-row muted" key={v.id}>
              <div className="event-main">
                <div className="site">
                  {v.name}
                  {v.clients?.name ? <span className="client-badge">{v.clients.name}</span> : null}
                </div>
                <div className="meta">{v.town || 'No town set'}</div>
              </div>
              {canEdit && (
                <div className="event-actions">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={busy === v.id}
                    onClick={() => patch(v, { active: true })}
                  >
                    Watch again
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
