'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

// A venue starts with one menu set, so the grid has something to tick
// straight away. More sets (UEFA, Cup) are added from the venue page.
export function CreateMenuVenueForm({ clients }) {
  const supabase = createClient();
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [firstSetName, setFirstSetName] = useState('Standard');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function create(e) {
    e.preventDefault();
    if (!clientId || !name.trim()) {
      setError('Pick a client and give the venue a name.');
      return;
    }
    setSaving(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    const { data: venue, error: vErr } = await supabase
      .from('menu_venues')
      .insert({ client_id: clientId, name: name.trim(), created_by: user?.id })
      .select('id')
      .single();
    if (vErr) {
      setSaving(false);
      setError(vErr.message);
      return;
    }
    const { error: sErr } = await supabase
      .from('menu_sets')
      .insert({ venue_id: venue.id, name: firstSetName.trim() || 'Standard', position: 0 });
    if (sErr) {
      // The venue exists; say so rather than leave the user to create it twice.
      setSaving(false);
      setError(`Venue created, but its first menu set failed: ${sErr.message}. Add one from the venue page.`);
      return;
    }
    router.push(`/menus/${venue.id}?tab=import`);
  }

  return (
    <form className="filter-row" onSubmit={create}>
      <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
        <option value="">Client…</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input
        type="text"
        placeholder="Venue name, e.g. Old Trafford"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Venue name"
      />
      <input
        type="text"
        placeholder="First menu set"
        value={firstSetName}
        onChange={(e) => setFirstSetName(e.target.value)}
        aria-label="First menu set"
        title="The first menu set, e.g. Premier League. You can add more later."
      />
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? 'Adding…' : 'Add venue'}
      </button>
      {error && <span className="error-text">{error}</span>}
    </form>
  );
}
