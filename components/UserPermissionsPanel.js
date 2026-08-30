'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { suggestPassword } from '../lib/suggestPassword';
import { logAdminAction } from '../lib/logAdminAction';

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
  const [nameOpenFor, setNameOpenFor] = useState(null); // profileId currently editing their name
  const [nameDraft, setNameDraft] = useState('');

  function nameFor(profileId) {
    const p = profiles.find((x) => x.id === profileId);
    return p?.full_name || p?.email || profileId;
  }

  async function handleRoleChange(profileId, newRole) {
    if (profileId === currentUserId && newRole !== 'super_admin') {
      if (!confirm("This will remove your own super admin access. You won't be able to undo this yourself. Continue?")) {
        return;
      }
    }
    const prev = profiles;
    const prevRole = prev.find((x) => x.id === profileId)?.role;
    const name = nameFor(profileId);
    setBusyKey(`role:${profileId}`);
    setProfiles((p) => p.map((x) => (x.id === profileId ? { ...x, role: newRole } : x)));
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', profileId);
    setBusyKey(null);
    if (error) {
      alert('Could not update role. Please try again.');
      setProfiles(prev);
    } else {
      logAdminAction(supabase, 'change_role', name, { from: prevRole, to: newRole });
    }
  }

  async function handleGrantToggle(profileId, clientId, checked) {
    const key = `${profileId}:${clientId}`;
    const name = nameFor(profileId);
    const client = clients.find((c) => c.id === clientId);
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
    } else {
      logAdminAction(supabase, checked ? 'grant_client_access' : 'revoke_client_access', name, { client_name: client?.name });
    }
  }

  function viewerClientFor(profileId) {
    const c = clients.find((c) => grants.has(`${profileId}:${c.id}`));
    return c?.id || '';
  }

  async function handleViewerClientChange(profileId, clientId) {
    const key = `viewer:${profileId}`;
    const name = nameFor(profileId);
    const toRemove = clients.filter((c) => grants.has(`${profileId}:${c.id}`)).map((c) => c.id);
    setBusyKey(key);
    const prevGrants = new Set(grants);
    setGrants((g) => {
      const next = new Set(g);
      toRemove.forEach((cid) => next.delete(`${profileId}:${cid}`));
      if (clientId) next.add(`${profileId}:${clientId}`);
      return next;
    });

    try {
      if (toRemove.length) {
        const { error } = await supabase.from('profile_clients').delete().eq('profile_id', profileId).in('client_id', toRemove);
        if (error) throw error;
      }
      if (clientId) {
        const { error } = await supabase.from('profile_clients').insert({ profile_id: profileId, client_id: clientId });
        if (error) throw error;
      }
      const client = clients.find((c) => c.id === clientId);
      logAdminAction(supabase, 'grant_client_access', name, { client_name: client?.name });
    } catch (err) {
      alert('Could not update client access. Please try again.');
      setGrants(prevGrants);
    }
    setBusyKey(null);
  }

  async function handleToggleActive(profileId, newActive) {
    const name = nameFor(profileId);
    const verb = newActive ? 'Reactivate' : 'Deactivate';
    const consequence = newActive
      ? 'They will be able to sign in again immediately.'
      : 'They will be signed out and unable to sign in until reactivated.';
    if (!confirm(`${verb} ${name}? ${consequence}`)) return;

    const key = `active:${profileId}`;
    setBusyKey(key);
    const prev = profiles;
    setProfiles((p) => p.map((x) => (x.id === profileId ? { ...x, active: newActive } : x)));
    try {
      const res = await fetch('/api/admin-toggle-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profileId, active: newActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update this account.');
    } catch (err) {
      alert(err.message);
      setProfiles(prev);
    }
    setBusyKey(null);
  }

  function openNameEdit(p) {
    setNameOpenFor(p.id);
    setNameDraft(p.full_name || '');
  }

  async function confirmNameEdit(profileId) {
    const newName = nameDraft.trim();
    const prev = profiles;
    const oldName = prev.find((x) => x.id === profileId)?.full_name || '';
    const key = `name:${profileId}`;
    setBusyKey(key);
    setProfiles((p) => p.map((x) => (x.id === profileId ? { ...x, full_name: newName } : x)));
    const { error } = await supabase.from('profiles').update({ full_name: newName || null }).eq('id', profileId);
    setBusyKey(null);
    if (error) {
      alert('Could not update name. Please try again.');
      setProfiles(prev);
    } else {
      setNameOpenFor(null);
      if (newName !== oldName) {
        logAdminAction(supabase, 'rename_account', newName || '(unnamed)', { from: oldName });
      }
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
        const isClientViewer = p.role === 'client_viewer';
        const isActive = p.active !== false;
        const isSelf = p.id === currentUserId;
        const newPassword = resetPasswords[p.id];
        const isComposing = resetOpenFor === p.id;
        return (
          <div className="user-row" key={p.id} style={!isActive ? { opacity: 0.6 } : undefined}>
            <div className="user-row-head">
              <div>
                <div className="user-name">
                  {p.full_name || 'Unnamed'}
                  {isSelf ? <span className="you-badge">You</span> : null}
                  {!isActive ? <span className="you-badge" style={{ background: 'rgba(224,104,75,0.15)', color: 'var(--warn)' }}>Deactivated</span> : null}
                </div>
                <div className="user-email">{p.email || p.id}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => (nameOpenFor === p.id ? setNameOpenFor(null) : openNameEdit(p))}
                >
                  {nameOpenFor === p.id ? 'Cancel' : 'Edit Name'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => (isComposing ? setResetOpenFor(null) : openReset(p.id))}
                >
                  {isComposing ? 'Cancel' : 'Reset Password'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleToggleActive(p.id, !isActive)}
                  disabled={isSelf || busyKey === `active:${p.id}`}
                  title={isSelf ? "You can't deactivate your own account" : undefined}
                  style={isActive ? { borderColor: 'var(--warn)', color: 'var(--warn)' } : undefined}
                >
                  {busyKey === `active:${p.id}` ? 'Working…' : isActive ? 'Deactivate' : 'Reactivate'}
                </button>
                <select
                  value={p.role}
                  onChange={(e) => handleRoleChange(p.id, e.target.value)}
                  disabled={busyKey === `role:${p.id}`}
                  style={{ width: 'auto', minWidth: 150 }}
                >
                  <option value="user">User</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="client_viewer">Client Viewer</option>
                </select>
              </div>
            </div>

            {nameOpenFor === p.id && (
              <div className="panel" style={{ margin: '10px 0 0', padding: 12 }}>
                <div className="field-row" style={{ marginBottom: 8 }}>
                  <div className="field" style={{ flex: '1 1 auto' }}>
                    <label>Full Name</label>
                    <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Full name" />
                  </div>
                </div>
                <div className="actions-row" style={{ justifyContent: 'flex-start' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => confirmNameEdit(p.id)}
                    disabled={busyKey === `name:${p.id}`}
                  >
                    {busyKey === `name:${p.id}` ? 'Saving…' : 'Save Name'}
                  </button>
                </div>
              </div>
            )}

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

            {p.role === 'user' && (
              clients.length === 0 ? (
                <p className="hint" style={{ margin: '8px 0 0' }}>No clients exist yet — add some in Admin → Clients first.</p>
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
            {isClientViewer && (
              clients.length === 0 ? (
                <p className="hint" style={{ margin: '8px 0 0' }}>No clients exist yet — add one in Admin → Clients first.</p>
              ) : (
                <div className="field-row" style={{ marginTop: 8, marginBottom: 0 }}>
                  <div className="field" style={{ flex: '1 1 260px' }}>
                    <label>Client (read-only access)</label>
                    <select
                      value={viewerClientFor(p.id)}
                      onChange={(e) => handleViewerClientChange(p.id, e.target.value)}
                      disabled={busyKey === `viewer:${p.id}`}
                    >
                      <option value="">Please select</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
