'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { logAdminAction } from '../lib/logAdminAction';
import { slugify } from '../lib/projectStatus';

export function ClientManagementPanel({ initialClients }) {
  const supabase = createClient();
  const [clients, setClients] = useState(initialClients);
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

  function requestUrl(slug) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
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
                    {c.intake_enabled && <span className="client-badge intake-badge" style={{ marginLeft: 8 }}>Request form live</span>}
                    <div className="client-row-email">{c.notification_email || 'No notification inbox set'}</div>
                    {c.intake_enabled && c.slug && (
                      <div className="intake-link" style={{ marginTop: 4 }}>{requestUrl(c.slug)}</div>
                    )}
                  </div>
                  {c.intake_enabled && c.slug && (
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
