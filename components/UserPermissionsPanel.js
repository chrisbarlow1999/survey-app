'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { suggestPassword } from '../lib/suggestPassword';

export function UserPermissionsPanel({ currentUserId, initialProfiles, clients, initialGrants }) {
  const supabase = createClient();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [grants, setGrants] = useState(
    new Set(initialGrants.map((g) => `${g.profile_id}:${g.client_id}`))
  );
  const [busyKey, setBusyKey] = useState(null);
  const [resetPasswords, setResetPasswords] = useState({}); // profileId -> confirmed new password
  const [resetOpenFor, setResetOpenFor] = useState(null); // profileId currently composing a reset
  const [resetDraft, setResetDraft] = useState('');

  async function handleRoleChange(profileId, newRole) {
    if (profileId === currentUserId && newRole !== 'super_admin') {
      if (!confirm("This will remove your own super admin access. You won't be able to undo this yourself. Continue?")) {
        return;
      }
    }
    setBusyKey(`role:${profileId}`);
    const prev = profiles;
    setProfiles((p) => p.map((x) => (x.id === profileId ? { ...x, role: newRole } : x)));
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', profileId);
    setBusyKey(null);
    if (error) {
      alert('Could not update role. Please try again.');
      setProfiles(prev);
    }
  }

  async function handleGrantToggle(profileId, clientId, checked) {
    const key = `${profileId}:${clientId}`;
    setBusyKey(key);
    const prevGrants = new Set(grants);
    setGrants((g) => {
      const next = new Set(g);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });

    const { error } = checked
      ? await supabase.from('profile_clients').insert({ profile_id: profileId, client_id: clientId })
      : await supabase.from('profile_clients').delete().eq('profile_id', profileId).eq('client_id', clientId);

    setBusyKey(null);
    if (error) {
      alert('Could not update client access. Please try again.');
      setGrants(prevGrants);
    }
  }

  function openReset(profileId) {
    setResetOpenFor(profileId);
    setResetDraft(suggestPassword());
  }

  async function confirmReset(profileId) {
    const password = resetDraft.trim();
    if (password.length < 6) return;
    const key = `reset:${profileId}`;
    setBusyKey(key);
    try {
      const res = await fetch('/api/admin-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profileId, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not reset password.');
      setResetPasswords((r) => ({ ...r, [profileId]: data.password }));
      setResetOpenFor(null);
    } catch (err) {
      alert(err.message);
    }
    setBusyKey(null);
  }

  function copyPassword(password) {
    navigator.clipboard.writeText(password).catch(() => {});
  }

  if (profiles.length === 0) {
    return <div className="empty-state">No accounts yet.</div>;
  }

  return (
    <div className="user-table">
      {profiles.map((p) => {
        const isSuperAdmin = p.role === 'super_admin';
        const newPassword = resetPasswords[p.id];
        const isComposing = resetOpenFor === p.id;
        return (
          <div className="user-row" key={p.id}>
            <div className="user-row-head">
              <div>
                <div className="user-name">{p.full_name || 'Unnamed'}{p.id === currentUserId ? <span className="you-badge">You</span> : null}</div>
                <div className="user-email">{p.email || p.id}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => (isComposing ? setResetOpenFor(null) : openReset(p.id))}
                >
                  {isComposing ? 'Cancel' : 'Reset Password'}
                </button>
                <select
                  value={p.role}
                  onChange={(e) => handleRoleChange(p.id, e.target.value)}
                  disabled={busyKey === `role:${p.id}`}
                  style={{ width: 'auto', minWidth: 150 }}
                >
                  <option value="user">User</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
            </div>

            {isComposing && (
              <div className="panel" style={{ margin: '10px 0 0', padding: 12 }}>
                <p className="hint" style={{ margin: '0 0 8px' }}>
                  A random password is suggested below — edit it to set your own, or use it as-is.
                  Their current password stops working the moment you confirm.
                </p>
                <div className="field-row" style={{ marginBottom: 8 }}>
                  <div className="field" style={{ flex: '1 1 auto' }}>
                    <input value={resetDraft} onChange={(e) => setResetDraft(e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
                  </div>
                </div>
                {resetDraft.trim().length > 0 && resetDraft.trim().length < 6 && (
                  <p className="error-text" style={{ margin: '0 0 8px' }}>Must be at least 6 characters.</p>
                )}
                <div className="actions-row" style={{ justifyContent: 'flex-start' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setResetDraft(suggestPassword())}>Generate New</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => confirmReset(p.id)}
                    disabled={busyKey === `reset:${p.id}` || resetDraft.trim().length < 6}
                  >
                    {busyKey === `reset:${p.id}` ? 'Setting…' : 'Set Password'}
                  </button>
                </div>
              </div>
            )}

            {newPassword && (
              <div className="panel success-panel" style={{ margin: '10px 0 0', padding: 12 }}>
                <p className="hint" style={{ margin: '0 0 6px' }}>
                  New password — give this to them directly, it won't be shown again.
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{newPassword}</span>
                  <button type="button" className="btn btn-ghost" onClick={() => copyPassword(newPassword)}>Copy</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setResetPasswords((r) => { const next = { ...r }; delete next[p.id]; return next; })}>Dismiss</button>
                </div>
              </div>
            )}

            {!isSuperAdmin && (
              clients.length === 0 ? (
                <p className="hint" style={{ margin: '8px 0 0' }}>No clients exist yet — add some in Supabase's Table Editor first.</p>
              ) : (
                <div className="client-grant-grid">
                  {clients.map((c) => {
                    const key = `${p.id}:${c.id}`;
                    const checked = grants.has(key);
                    return (
                      <label className="client-grant-chip" key={c.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busyKey === key}
                          onChange={(e) => handleGrantToggle(p.id, c.id, e.target.checked)}
                        />
                        {c.name}
                      </label>
                    );
                  })}
                </div>
              )
            )}
            {isSuperAdmin && <p className="hint" style={{ margin: '8px 0 0' }}>Super admins can see every client's surveys.</p>}
          </div>
        );
      })}
    </div>
  );
}
