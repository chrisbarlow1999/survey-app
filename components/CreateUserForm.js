'use client';

import { useState } from 'react';
import { suggestPassword } from '../lib/suggestPassword';

export function CreateUserForm({ clients }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [password, setPassword] = useState(() => suggestPassword());
  const [selectedClients, setSelectedClients] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  function toggleClient(id) {
    setSelectedClients((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (password.trim().length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin-create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
          role,
          clientIds: Array.from(selectedClients),
          password: password.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create account.');
      setCreated({ email: data.email, password: data.password });
      setFullName('');
      setEmail('');
      setRole('user');
      setSelectedClients(new Set());
      setPassword(suggestPassword());
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  }

  function copyPassword() {
    if (created) navigator.clipboard.writeText(created.password).catch(() => {});
  }

  return (
    <div>
      {created && (
        <div className="panel success-panel" style={{ marginBottom: 16 }}>
          <h2>Account Created</h2>
          <p className="hint">
            Give these details to {created.email} directly (Slack, in person, etc.) — this password
            won't be shown again. They can sign in right away at /login.
          </p>
          <div className="kv-grid">
            <div className="kv"><div className="k">Email</div><div className="v">{created.email}</div></div>
            <div className="kv"><div className="k">Temporary Password</div><div className="v" style={{ fontFamily: 'var(--font-mono)' }}>{created.password}</div></div>
          </div>
          <div className="actions-row" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn-ghost" onClick={copyPassword}>Copy Password</button>
            <button type="button" className="btn btn-ghost" onClick={() => setCreated(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field"><label>Full Name</label><input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="field"><label className="req">Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@linney.com" /></div>
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">User</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field" style={{ flex: '1 1 100%' }}>
            <label className="req">Password</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={password} onChange={(e) => setPassword(e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
              <button type="button" className="btn btn-ghost" onClick={() => setPassword(suggestPassword())} style={{ whiteSpace: 'nowrap' }}>Generate New</button>
            </div>
            <p className="hint" style={{ margin: '6px 0 0' }}>A random password is suggested — edit it to set your own, or use it as-is.</p>
          </div>
        </div>

        {role === 'user' && (
          clients.length === 0 ? (
            <p className="hint">No clients exist yet — add some above first.</p>
          ) : (
            <div className="client-grant-grid" style={{ marginBottom: 14 }}>
              {clients.map((c) => (
                <label className="client-grant-chip" key={c.id}>
                  <input type="checkbox" checked={selectedClients.has(c.id)} onChange={() => toggleClient(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          )
        )}
        {role === 'super_admin' && (
          <p className="hint">Super admins see every client's surveys and installations — no need to pick specific ones.</p>
        )}

        {error && <p className="error-text">{error}</p>}
        <div className="actions-row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create Account'}</button>
        </div>
      </form>
    </div>
  );
}
