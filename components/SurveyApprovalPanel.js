'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { formatDateTime } from '../lib/formatDate';

const LABEL = {
  not_sent: 'Not sent',
  awaiting: 'Awaiting client',
  approved: 'Approved',
  changes_requested: 'Changes requested',
};
const TONE = {
  not_sent: 'open',
  awaiting: 'active',
  approved: 'done',
  changes_requested: 'warn',
};

// PM side of the client approval loop. Sending doesn't email anything — it
// opens the link and marks the survey as awaiting, so you paste the URL into
// whatever you already use. Once email is unblocked this is where sending
// would hook in.
export function SurveyApprovalPanel({ survey, canEdit }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Read after mount: branching on `window` during render makes the server and
  // client markup disagree and React throws the subtree away.
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/approve/${survey.approval_token}`;

  const status = survey.approval_status || 'not_sent';

  async function setStatus(next) {
    setBusy(true);
    setError('');
    const patch = { approval_status: next };
    if (next === 'awaiting') patch.approval_sent_at = new Date().toISOString();
    const { data, error: updErr } = await supabase
      .from('surveys').update(patch).eq('id', survey.id).select('id, approval_status');
    setBusy(false);
    if (updErr) {
      console.error(updErr);
      setError('Could not update the approval status.');
      return;
    }
    // A Supabase update that matches no rows returns no error — it just does
    // nothing. Without this the button would look like it worked.
    if (!data || data.length === 0) {
      setError('That change was refused — you may not have edit access to this survey.');
      return;
    }
    router.refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the link is on screen to copy by hand.
    }
  }

  return (
    <div className="panel no-print">
      <h2>
        Client Approval
        <span className={`status-pill status-${TONE[status]}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>
          {LABEL[status]}
        </span>
      </h2>

      {status === 'not_sent' && (
        <>
          <p className="hint">
            Open the link and the client can approve this survey or ask for changes, without an
            account. Nothing is emailed automatically — send the link however you normally would.
          </p>
          {canEdit && (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => setStatus('awaiting')}>
              {busy ? 'Opening…' : 'Open for client approval'}
            </button>
          )}
        </>
      )}

      {status !== 'not_sent' && (
        <>
          <p className="hint">
            {status === 'awaiting'
              ? 'Send this link to the client. It shows the client-facing version of this survey only.'
              : 'The link stays live so the client can see what they responded to.'}
          </p>
          <div className="intake-link">{link}</div>
          <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="btn btn-ghost" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy Link'}</button>
            <a className="btn btn-ghost" href={`/approve/${survey.approval_token}`} target="_blank" rel="noreferrer">Preview</a>
            {canEdit && status !== 'not_sent' && (
              <button
                className="btn btn-danger"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirm('Withdraw this link? The client will no longer be able to open it, and any response already given is kept on record.')) {
                    setStatus('not_sent');
                  }
                }}
              >
                Withdraw link
              </button>
            )}
          </div>
        </>
      )}

      {(status === 'approved' || status === 'changes_requested') && (
        <div className="kv" style={{ marginTop: 16, borderColor: status === 'approved' ? 'var(--ok)' : 'var(--warn)' }}>
          <div className="k">
            {status === 'approved' ? 'Approved by' : 'Changes requested by'}
            {survey.approval_decided_at ? ` · ${formatDateTime(survey.approval_decided_at)}` : ''}
          </div>
          <div className="v">{survey.approval_name || 'Unknown'}</div>
          {survey.approval_comment && <div className="v" style={{ marginTop: 6 }}>{survey.approval_comment}</div>}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
