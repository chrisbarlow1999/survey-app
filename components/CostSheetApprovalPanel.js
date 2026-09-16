'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { formatDateTime } from '../lib/formatDate';
import { costSheetLabel, costSheetTone } from '../lib/costSheetStatus';
import { sheetTotals } from '../lib/costSheet';

// The PM side of getting a quote agreed. Deliberately the same shape as
// SurveyApprovalPanel — send, copy, preview, withdraw, reopen — because it is
// the same job, and a second pattern for it would be a second thing to learn.
//
// Sending doesn't email anything. It opens the link and marks the sheet as
// awaiting; you send the URL however you normally would.
export function CostSheetApprovalPanel({ sheet, canEdit }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Read after mount: branching on `window` during render makes the server and
  // client markup disagree and React throws the subtree away.
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/quote/${sheet.approval_token}`;

  const status = sheet.approval_status || 'not_sent';
  const totals = sheetTotals(sheet.items || []);
  // A line with no price would show the client a total that silently omits it.
  // Better to refuse to send than to send something wrong.
  const blocked = totals.unpriced > 0 || (sheet.items || []).length === 0;

  async function setStatus(next) {
    setBusy(true);
    setError('');
    const patch = { approval_status: next };
    if (next === 'awaiting') patch.approval_sent_at = new Date().toISOString();
    const { data, error: updErr } = await supabase
      .from('cost_sheets').update(patch).eq('id', sheet.id).select('id, approval_status');
    setBusy(false);
    if (updErr) {
      console.error(updErr);
      setError('Could not update the approval status.');
      return;
    }
    // An update that matches no rows returns no error — it just does nothing.
    if (!data || data.length === 0) {
      setError('That change was refused — you may not have edit access to this sheet.');
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
        <span className={`status-pill status-${costSheetTone(status)}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>
          {costSheetLabel(status)}
        </span>
      </h2>

      {status === 'not_sent' && (
        <>
          <p className="hint">
            Open the link and the client can approve this quote or ask for changes, without an
            account. They see the lines and the price — never your cost or margin. Nothing is
            emailed automatically.
          </p>
          {blocked && (
            <p className="error-text">
              {(sheet.items || []).length === 0
                ? 'Add at least one line before sending this sheet.'
                : `${totals.unpriced} line${totals.unpriced === 1 ? '' : 's'} still have no price. The client would see a total that leaves them out.`}
            </p>
          )}
          {canEdit && (
            <button className="btn btn-primary" type="button" disabled={busy || blocked} onClick={() => setStatus('awaiting')}>
              {busy ? 'Opening…' : 'Send for client approval'}
            </button>
          )}
        </>
      )}

      {status !== 'not_sent' && (
        <>
          <p className="hint">
            {status === 'awaiting'
              ? 'Send this link to the client. While it is open the sheet is locked, so the document they are reading cannot change underneath them.'
              : 'The link stays live so the client can see what they responded to.'}
          </p>
          <div className="intake-link">{link}</div>
          <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="btn btn-ghost" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy Link'}</button>
            <a className="btn btn-ghost" href={`/quote/${sheet.approval_token}`} target="_blank" rel="noreferrer">Preview</a>
            {canEdit && (status === 'approved' || status === 'changes_requested') && (
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setStatus('awaiting')}>
                Reopen for approval
              </button>
            )}
            {canEdit && (
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

      {status === 'awaiting' && sheet.approval_decided_at && (
        <p className="hint" style={{ marginTop: 12 }}>
          Waiting on a new response. A previous response is on record from
          {sheet.approval_name ? ` ${sheet.approval_name}` : ' the client'} on {formatDateTime(sheet.approval_decided_at)}.
          {sheet.approval_comment ? ` They said: “${sheet.approval_comment}”` : ''}
        </p>
      )}

      {(status === 'approved' || status === 'changes_requested') && (
        <div className="kv" style={{ marginTop: 16, borderColor: status === 'approved' ? 'var(--ok)' : 'var(--warn)' }}>
          <div className="k">
            {status === 'approved' ? 'Approved by' : 'Changes requested by'}
            {sheet.approval_decided_at ? ` · ${formatDateTime(sheet.approval_decided_at)}` : ''}
          </div>
          <div className="v">{sheet.approval_name || 'Unknown'}</div>
          {sheet.approval_comment && <div className="v" style={{ marginTop: 6 }}>{sheet.approval_comment}</div>}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
