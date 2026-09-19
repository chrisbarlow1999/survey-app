'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

// Three ways to start a venue, because the second stadium for a client we
// already hold shouldn't be typed out again:
//
//   Blank              a name and one menu set, then import the client's sheet
//   Copy of a venue    sections, products and menu sets from a sister site,
//                      optionally its outlets and their ticks too
//
// A copy keeps the client of the venue it came from — that's the whole point,
// so there's no client to pick.
export function CreateMenuVenueForm({ clients, venues }) {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState('blank');
  const [clientId, setClientId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [name, setName] = useState('');
  const [firstSetName, setFirstSetName] = useState('Standard');
  const [copyOutlets, setCopyOutlets] = useState(false);
  const [copyRanges, setCopyRanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const source = venues.find((v) => v.id === sourceId);

  async function createBlank() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: venue, error: vErr } = await supabase
      .from('menu_venues')
      .insert({ client_id: clientId, name: name.trim(), created_by: user?.id })
      .select('id')
      .single();
    if (vErr) throw new Error(vErr.message);
    const { error: sErr } = await supabase
      .from('menu_sets')
      .insert({ venue_id: venue.id, name: firstSetName.trim() || 'Standard', position: 0 });
    if (sErr) {
      // The venue exists; say so rather than leave the user to create it twice.
      throw new Error(`Venue created, but its first menu set failed: ${sErr.message}. Add one from the venue page.`);
    }
    return `/menus/${venue.id}?tab=import`;
  }

  async function createCopy() {
    const { data, error: err } = await supabase.rpc('menu_copy_venue', {
      p_from_venue: sourceId,
      p_name: name.trim(),
      p_copy_outlets: copyOutlets,
      p_copy_ranges: copyOutlets && copyRanges,
    });
    if (err) throw new Error(err.message);
    // With outlets copied there's something to look at; without them, the next
    // step is the sheet that brings this site's own outlets in.
    return copyOutlets ? `/menus/${data}` : `/menus/${data}?tab=import`;
  }

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give the venue a name.');
      return;
    }
    if (mode === 'blank' && !clientId) {
      setError('Pick a client.');
      return;
    }
    if (mode === 'copy' && !sourceId) {
      setError('Pick the venue to copy.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const href = mode === 'copy' ? await createCopy() : await createBlank();
      router.push(href);
    } catch (err) {
      setSaving(false);
      setError(err.message);
    }
  }

  return (
    <form onSubmit={create}>
      <div className="filter-row">
        <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Start from">
          <option value="blank">Start blank</option>
          <option value="copy" disabled={venues.length === 0}>Copy an existing venue</option>
        </select>

        {mode === 'blank' ? (
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
            <option value="">Client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} aria-label="Venue to copy">
            <option value="">Venue to copy…</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.clients?.name ? `${v.clients.name} — ` : ''}{v.name}
              </option>
            ))}
          </select>
        )}

        <input
          type="text"
          placeholder="Venue name, e.g. Old Trafford"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Venue name"
        />

        {mode === 'blank' && (
          <input
            type="text"
            placeholder="First menu set"
            value={firstSetName}
            onChange={(e) => setFirstSetName(e.target.value)}
            aria-label="First menu set"
            title="The first menu set, e.g. Premier League. You can add more later."
          />
        )}

        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add venue'}
        </button>
        {error && <span className="error-text">{error}</span>}
      </div>

      {mode === 'copy' && (
        <div className="filter-row" style={{ marginTop: 4 }}>
          <label className="menu-import-check">
            <input type="checkbox" checked={copyOutlets} onChange={(e) => setCopyOutlets(e.target.checked)} />
            Copy its outlets too
          </label>
          <label className="menu-import-check">
            <input
              type="checkbox"
              checked={copyOutlets && copyRanges}
              disabled={!copyOutlets}
              onChange={(e) => setCopyRanges(e.target.checked)}
            />
            And what each one sells
          </label>
          <span className="hint" style={{ margin: 0 }}>
            {source
              ? `Takes ${source.menu_products?.[0]?.count ?? 0} products and ${source.menu_sets?.[0]?.count ?? 0} menu sets from ${source.name}.`
              : 'Products and menu sets always come across.'}
            {' '}Store codes and schedules stay behind — they belong to the site they came from.
          </span>
        </div>
      )}
    </form>
  );
}
