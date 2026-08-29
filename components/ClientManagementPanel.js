'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabaseClient';

export function ClientManagementPanel({ initialClients }) {
  const supabase = createClient();
  const [clients, setClients] = useState(initialClients);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingEmail, setEditingEmail] = useState('');
  const [busyId, setBusyId] = useState(null);

  function sorted(list) {
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }

  async function handleAdd(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setError('');
    const { data, error: insErr } = await supabase.from('clients').insert({ name }).select().single();
    setAdding(false);
    if (insErr) {
      setError(insErr.code === '23505' ? 'A client with that name already exists.' : 'Could not add client.');
      return;
    }
    setClients((c) => sorted([...c, data]));
    setNewName('');
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditingName(c.name);
    setEditingEmail(c.notification_email || '');
  }

  async function handleSaveEdit(id) {
    const name = editingName.trim();
    if (!name) return;
    const notificationEmail = editingEmail.trim() || null;
    setBusyId(id);
    const prev = clients;
    setClients((c) => sorted(c.map((x) => (x.id === id ? { ...x, name, notification_email: notificationEmail } : x))));
    const { error: updErr } = await supabase.from('clients').update({ name, notification_email: notificationEmail }).eq('id', id);
    setBusyId(null);
    setEditingId(null);
    if (updErr) {
      alert(updErr.code === '23505' ? 'A client with that name already exists.' : 'Could not save changes.');
      setClients(prev);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete client "${name}"? This only works if it has no surveys assigned to it.`)) return;
    setBusyId(id);
    const prev = clients;
    setClients((c) => c.filter((x) => x.id !== id));
    const { error: delErr } = await supabase.from('clients').delete().eq('id', id);
    setBusyId(null);
    if (delErr) {
      alert('Could not delete this client — it likely still has surveys assigned to it.');
      setClients(prev);
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
                    <input type="email" value={editingEmail} onChange={(e) => setEditingEmail(e.target.value)} style={{ flex: '1 1 220px' }} placeholder="Notification inbox (optional)" />
                  </div>
                  <button className="btn btn-ghost" type="button" onClick={() => handleSaveEdit(c.id)} disabled={busyId === c.id}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <span className="client-row-name">{c.name}</span>
                    <div className="client-row-email">{c.notification_email || 'No notification inbox set'}</div>
                  </div>
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
