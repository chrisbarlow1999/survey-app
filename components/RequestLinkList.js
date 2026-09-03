'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { logAdminAction } from '../lib/logAdminAction';
import { formatDateTime } from '../lib/formatDate';

// The share-and-switch view of the client request forms. Admin → Clients is
// where a client's details get edited; this is where you come to find a link to
// send someone, see which forms are open, and check whether anything has
// actually come through them.
export function RequestLinkList({ rows }) {
  const supabase = createClient();
  const router = useRouter();
  const [copiedId, setCopiedId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  function requestUrl(slug) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/request/${slug}`;
  }

  async function copyLink(row) {
    try {
      await navigator.clipboard.writeText(requestUrl(row.slug));
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard access can be blocked; the URL is on screen to copy by hand.
    }
  }

  async function toggle(row) {
    const turningOn = !row.intake_enabled;
    if (turningOn && !confirm(`Open the request form for ${row.name}? Anyone with the link will be able to raise a project without an account.`)) return;

    setBusyId(row.id);
    const { error } = await supabase
      .from('clients')
      .update({ intake_enabled: turningOn })
      .eq('id', row.id);
    setBusyId(null);
    if (error) {
      console.error(error);
      alert('Could not change that request form.');
      return;
    }
    logAdminAction(supabase, turningOn ? 'enable_client_intake' : 'disable_client_intake', row.name);
    router.refresh();
  }

  if (rows.length === 0) {
    return <div className="empty-state">No clients yet — add one under Admin → Clients.</div>;
  }

  return (
    <div className="client-list">
      {rows.map((row) => (
        <div className="client-row" key={row.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="client-row-name">{row.name}</span>
            <span className={`client-badge ${row.intake_enabled ? 'intake-badge' : 'archived-badge'}`} style={{ marginLeft: 8 }}>
              {row.intake_enabled ? 'Live' : 'Off'}
            </span>
            {row.slug ? (
              <div className={`intake-link${row.intake_enabled ? '' : ' off'}`} style={{ marginTop: 4 }}>
                {requestUrl(row.slug)}
              </div>
            ) : (
              <div className="intake-link off" style={{ marginTop: 4 }}>
                No link yet — set one under Admin → Clients.
              </div>
            )}
            <div className="client-row-email" style={{ marginTop: 4 }}>
              {row.requestCount === 0
                ? 'No requests received'
                : `${row.requestCount} request${row.requestCount === 1 ? '' : 's'} received · last ${formatDateTime(row.lastRequestAt)}`}
            </div>
          </div>
          {row.slug && (
            <button className="btn btn-ghost" type="button" onClick={() => copyLink(row)}>
              {copiedId === row.id ? 'Copied' : 'Copy Link'}
            </button>
          )}
          {row.slug && (
            <a className="btn btn-ghost" href={`/request/${row.slug}`} target="_blank" rel="noreferrer">Preview</a>
          )}
          {row.slug && (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => toggle(row)}
              disabled={busyId === row.id}
              style={row.intake_enabled ? { borderColor: 'var(--warn)', color: 'var(--warn)' } : undefined}
            >
              {busyId === row.id ? '…' : row.intake_enabled ? 'Turn Off' : 'Turn On'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
