'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { logAdminAction } from '../lib/logAdminAction';
import { slugify } from '../lib/projectStatus';

// A client's sectors (migration 047): add, rename by clicking, remove. Deleting
// a sector un-sectors its projects rather than touching them.
function SectorList({ client, sectors, setSectors }) {
  const supabase = createClient();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = sectors.filter((s) => s.client_id === client.id).sort((a, b) => a.name.localeCompare(b.name));

  async function add(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    const { data, error } = await supabase.from('client_sectors').insert({ client_id: client.id, name: n }).select('id, client_id, name').single();
    setBusy(false);
    if (error) {
      alert(error.code === '23505' ? `${client.name} already has a sector called "${n}".` : 'Could not add that sector.');
      return;
    }
    setSectors((list) => [...list, data]);
    setName('');
    logAdminAction(supabase, 'create_sector', `${client.name} · ${n}`);
  }

  async function rename(s) {
    const n = (window.prompt(`Rename sector "${s.name}"`, s.name) || '').trim();
    if (!n || n === s.name) return;
    const { error } = await supabase.from('client_sectors').update({ name: n }).eq('id', s.id);
    if (error) {
      alert(error.code === '23505' ? `${client.name} already has a sector called "${n}".` : 'Could not rename that sector.');
      return;
    }
    setSectors((list) => list.map((x) => (x.id === s.id ? { ...x, name: n } : x)));
    logAdminAction(supabase, 'rename_sector', `${client.name} · ${n}`, { from: s.name });
  }

  async function remove(s) {
    if (!confirm(`Remove sector "${s.name}" from ${client.name}? Its projects stay, just without a sector.`)) return;
    const { error } = await supabase.from('client_sectors').delete().eq('id', s.id);
    if (error) {
      alert('Could not remove that sector.');
      return;
    }
    setSectors((list) => list.filter((x) => x.id !== s.id));
    logAdminAction(supabase, 'delete_sector', `${client.name} · ${s.name}`);
  }

  return (
    <div className="sector-list">
      <span className="sector-list-label">Sectors</span>
      {mine.length === 0 && <span className="sector-list-empty">None</span>}
      {mine.map((s) => (
        <span key={s.id} className="client-badge sector-chip">
          <button type="button" className="sector-chip-name" onClick={() => rename(s)} title="Click to rename">{s.name}</button>
          <button type="button" className="sector-chip-x" onClick={() => remove(s)} aria-label={`Remove ${s.name}`}>×</button>
        </span>
      ))}
      <form onSubmit={add} className="sector-add">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a sector…" maxLength={80} />
        <button className="btn btn-ghost" type="submit" disabled={busy || !name.trim()}>Add</button>
      </form>
    </div>
  );
}

export function ClientManagementPanel({ initialClients, initialSectors = [], sectorsEnabled = false }) {
  const supabase = createClient();
  const [clients, setClients] = useState(initialClients);
  const [sectors, setSectors] = useState(initialSectors);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingEmail, setEditingEmail] = useState('');
  const [editingSlug, setEditingSlug] = useState('');
  const [editingIntake, setEditingIntake] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  function sorted(list) {
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Same hydration reasoning as RequestLinkList: reading window during render
  // makes the server and client markup disagree.
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  function requestUrl(slug) {
    return `${origin}/request/${slug}`;
  }

  async function handleAdd(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setError('');
    // The slug is derived up front so every client has a request URL ready to
    // turn on; intake itself stays off until someone deliberately enables it.
    const { data, error: insErr } = await supabase
      .from('clients')
      .insert({ name, slug: slugify(name) || null })
      .select()
      .single();
    setAdding(false);
    if (insErr) {
      setError(insErr.code === '23505' ? 'A client with that name or request link already exists.' : 'Could not add client.');
      return;
    }
    setClients((c) => sorted([...c, data]));
    setNewName('');
    logAdminAction(supabase, 'create_client', name);
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditingName(c.name);
    setEditingEmail(c.notification_email || '');
    setEditingSlug(c.slug || '');
    setEditingIntake(Boolean(c.intake_enabled));
  }

  async function handleSaveEdit(id) {
    const name = editingName.trim();
    if (!name) return;
    const notificationEmail = editingEmail.trim() || null;
    const slug = slugify(editingSlug) || null;
    const intakeEnabled = editingIntake;

    if (intakeEnabled && !slug) {
      alert('A client needs a request link before its request form can be switched on.');
      return;
    }

    const before = clients.find((c) => c.id === id);
    setBusyId(id);
    const prev = clients;
    setClients((c) => sorted(c.map((x) => (
      x.id === id ? { ...x, name, notification_email: notificationEmail, slug, intake_enabled: intakeEnabled } : x
    ))));
    const { error: updErr } = await supabase
      .from('clients')
      .update({ name, notification_email: notificationEmail, slug, intake_enabled: intakeEnabled })
      .eq('id', id);
    setBusyId(null);
    setEditingId(null);
    if (updErr) {
      alert(updErr.code === '23505' ? 'That client name or request link is already taken.' : 'Could not save changes.');
      setClients(prev);
      return;
    }
    if (before?.name !== name) logAdminAction(supabase, 'rename_client', name, { from: before?.name });
    if (Boolean(before?.intake_enabled) !== intakeEnabled) {
      logAdminAction(supabase, intakeEnabled ? 'enable_client_intake' : 'disable_client_intake', name);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete client "${name}"? This only works if it has no records or projects assigned to it.`)) return;
    setBusyId(id);
    const prev = clients;
    setClients((c) => c.filter((x) => x.id !== id));
    const { error: delErr } = await supabase.from('clients').delete().eq('id', id);
    setBusyId(null);
    if (delErr) {
      alert('Could not delete this client — it likely still has records assigned to it.');
      setClients(prev);
    } else {
      logAdminAction(supabase, 'delete_client', name);
    }
  }

  async function copyLink(c) {
    try {
      await navigator.clipboard.writeText(requestUrl(c.slug));
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard access can be blocked; the URL is on screen to copy by hand.
    }
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="field-row" style={{ alignItems: 'flex-end', marginBottom: 16 }}>
        <div className="field" style={{ flex: '1 1 auto' }}>
          <label>New Client Name</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Starbucks" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={adding}>
          {adding ? 'Adding…' : 'Add Client'}
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}

      {clients.length === 0 ? (
        <div className="empty-state">No clients yet — add one above.</div>
      ) : (
        <div className="client-list">
          {clients.map((c) => (
            <div className="client-row" key={c.id}>
              {editingId === c.id ? (
                <>
                  <div style={{ flex: 1, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input value={editingName} onChange={(e) => setEditingName(e.target.value)} style={{ flex: '1 1 160px' }} autoFocus placeholder="Client name" />
                    <input type="email" value={editingEmail} onChange={(e) => setEditingEmail(e.target.value)} style={{ flex: '1 1 200px' }} placeholder="Notification inbox (optional)" />
                    <input value={editingSlug} onChange={(e) => setEditingSlug(e.target.value)} style={{ flex: '1 1 160px' }} placeholder="Request link (e.g. starbucks)" />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      <input
                        type="checkbox"
                        checked={editingIntake}
                        onChange={(e) => setEditingIntake(e.target.checked)}
                        style={{ width: 'auto' }}
                      />
                      Request form live
                    </label>
                  </div>
                  <button className="btn btn-ghost" type="button" onClick={() => handleSaveEdit(c.id)} disabled={busyId === c.id}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="client-row-name">{c.name}</span>
                    <span className={`client-badge ${c.intake_enabled ? 'intake-badge' : 'archived-badge'}`} style={{ marginLeft: 8 }}>
                      {c.intake_enabled ? 'Request form live' : 'Request form off'}
                    </span>
                    <div className="client-row-email">{c.notification_email || 'No notification inbox set'}</div>
                    {/* Shown whether or not intake is on, so the URL is discoverable
                        before you commit to switching it on — greyed out while off. */}
                    {c.slug ? (
                      <div className={`intake-link${c.intake_enabled ? '' : ' off'}`} style={{ marginTop: 4 }}>
                        {requestUrl(c.slug)}
                      </div>
                    ) : (
                      <div className="intake-link off" style={{ marginTop: 4 }}>
                        No request link yet — add one under Edit.
                      </div>
                    )}
                    {sectorsEnabled && <SectorList client={c} sectors={sectors} setSectors={setSectors} />}
                  </div>
                  {c.slug && (
                    <button className="btn btn-ghost" type="button" onClick={() => copyLink(c)}>
                      {copiedId === c.id ? 'Copied' : 'Copy Link'}
                    </button>
                  )}
                  <button className="btn btn-ghost" type="button" onClick={() => startEdit(c)} disabled={busyId === c.id}>Edit</button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => handleDelete(c.id, c.name)}
                    disabled={busyId === c.id}
                    style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
