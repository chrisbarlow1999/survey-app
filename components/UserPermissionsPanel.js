'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabaseClient';

export function UserPermissionsPanel({ currentUserId, initialProfiles, clients, initialGrants }) {
  const supabase = createClient();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [grants, setGrants] = useState(
    new Set(initialGrants.map((g) => `${g.profile_id}:${g.client_id}`))
  );
  const [busyKey, setBusyKey] = useState(null);

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

  if (profiles.length === 0) {
    return <div className="empty-state">No accounts yet.</div>;
  }

  return (
    <div className="user-table">
      {profiles.map((p) => {
        const isSuperAdmin = p.role === 'super_admin';
        return (
          <div className="user-row" key={p.id}>
            <div className="user-row-head">
              <div>
                <div className="user-name">{p.full_name || 'Unnamed'}{p.id === currentUserId ? <span className="you-badge">You</span> : null}</div>
                <div className="user-email">{p.email || p.id}</div>
              </div>
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
