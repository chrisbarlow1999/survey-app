'use client';

import { use, useEffect, useState } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { formatDate, formatDateTime } from '../../../../lib/formatDate';
import { formatGBP } from '../../../../lib/money';

// "4 days", not "4 day" — the stacked phone layout reads the unit as part of a
// phrase. "each" never pluralises, and a unit already ending in s is left
// alone. Deliberately simple: the catalogue's units are each, day and metre.
function unitLabel(unit, qty) {
  const u = (unit || 'each').trim();
  if (u === 'each' || Number(qty) === 1 || u.endsWith('s')) return u;
  return u + 's';
}

// The client-facing quote. No account, no login — whoever holds the link sees
// this one sheet and can approve it or ask for changes.
//
// Everything comes from get_cost_sheet_for_approval(), which rebuilds the lines
// with unit_cost and line_cost removed in SQL. This page therefore cannot leak
// margin even by accident, which is the whole reason the stripping happens
// there rather than here.
//
// The decision is made first, as its own step, and approving shows a summary to
// confirm — the same flow as the survey approval, for the same reason: a
// comment box above a blue button reads as "type your feedback, then submit".
export default function QuotePage({ params }) {
  const { token } = use(params);
  const supabase = createClient();

  const [sheet, setSheet] = useState(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [decided, setDecided] = useState(null);
  const [choice, setChoice] = useState(null);

  useEffect(() => {
    supabase.rpc('get_cost_sheet_for_approval', { p_token: token }).then(({ data }) => {
      setSheet(Array.isArray(data) ? data[0] || null : data || null);
      setLookupDone(true);
    });
  }, [token]);

  async function decide(decision) {
    setError('');
    if (!name.trim()) {
      setError('Please enter your name so we know who responded.');
      return;
    }
    if (decision === 'changes_requested' && !comment.trim()) {
      setError('Please tell us what needs changing.');
      return;
    }
    setSubmitting(true);
    const { data, error: rpcErr } = await supabase.rpc('submit_cost_sheet_approval', {
      p_token: token,
      p_decision: decision,
      p_name: name,
      // Comment text belongs to a change request only.
      p_comment: decision === 'approved' ? '' : comment,
    });
    setSubmitting(false);
    if (rpcErr || data === false) {
      console.error(rpcErr);
      setError('Something went wrong recording your response. Please try again.');
      return;
    }
    setDecided(decision);
  }

  if (!lookupDone) {
    return <main><div className="panel"><p className="hint">Loading…</p></div></main>;
  }

  // Deliberately vague: an unknown token and a withdrawn one look identical.
  if (!sheet) {
    return (
      <main>
        <div className="panel">
          <h2>This link isn&apos;t active</h2>
          <p className="hint">
            It may have been withdrawn or replaced. Please get in touch with your Linney contact for
            an up-to-date quote.
          </p>
        </div>
      </main>
    );
  }

  const alreadyDecided = decided || (sheet.approval_status !== 'awaiting' ? sheet.approval_status : null);
  const items = Array.isArray(sheet.items) ? sheet.items : [];
  const lineTotal = (i) => (Number(i.qty) || 0) * (Number(i.unit_price) || 0);

  return (
    <main>
      <div className="panel">
        <h2 style={{ fontSize: 20 }}>
          {sheet.title || sheet.site_location || 'Quote'}
          {sheet.client_name ? <span className="client-badge" style={{ marginLeft: 10, verticalAlign: 'middle' }}>{sheet.client_name}</span> : null}
        </h2>
        <p className="hint">
          Please review the costs below and let us know whether you&apos;re happy to proceed.
        </p>
        <div className="kv-grid">
          <div className="kv"><div className="k">Site</div><div className="v">{sheet.site_location || '—'}</div></div>
          <div className="kv"><div className="k">Reference</div><div className="v">{sheet.reference || '—'}</div></div>
          <div className="kv"><div className="k">Survey Date</div><div className="v">{sheet.survey_date ? formatDate(sheet.survey_date) : '—'}</div></div>
        </div>
      </div>

      {alreadyDecided && (
        <div className={`panel ${alreadyDecided === 'approved' ? 'success-panel' : ''}`}>
          <h2>{alreadyDecided === 'approved' ? 'Approved' : 'Changes requested'}</h2>
          <p className="hint" style={{ margin: 0 }}>
            {decided
              ? 'Thanks — your response has been sent to the project team.'
              : `Recorded${sheet.approval_name ? ` by ${sheet.approval_name}` : ''}${sheet.approval_decided_at ? ` on ${formatDateTime(sheet.approval_decided_at)}` : ''}.`}
          </p>
          {!decided && sheet.approval_comment && (
            <div className="kv" style={{ marginTop: 12 }}>
              <div className="k">Comments</div>
              <div className="v">{sheet.approval_comment}</div>
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <h2>Costs</h2>
        {/* Never scrolls sideways. The total is the one figure a client most
            needs, and on a scrolling table it sat off the right-hand edge. A
            table on wider screens; on a phone each line stacks instead,
            because five columns don't fit a phone however they're squeezed. */}
        <table className="data-table quote-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qty</th>
              <th>Unit</th>
              <th className="num">Unit price</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => (
              <tr key={idx}>
                <td>{i.description || '—'}</td>
                <td className="num">{i.qty}</td>
                <td>{i.unit || 'each'}</td>
                <td className="num">{formatGBP(i.unit_price)}</td>
                <td className="num">{formatGBP(lineTotal(i))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total, excluding VAT</td>
              <td className="num">{formatGBP(sheet.total_price)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="quote-lines">
          {items.map((i, idx) => (
            <div className="quote-line" key={idx}>
              <div className="quote-line-desc">{i.description || '—'}</div>
              <div className="quote-line-maths">
                <span>{i.qty} {unitLabel(i.unit, i.qty)} × {formatGBP(i.unit_price)}</span>
                <span className="quote-line-total">{formatGBP(lineTotal(i))}</span>
              </div>
            </div>
          ))}
          <div className="quote-line quote-line-grand">
            <span>Total, excluding VAT</span>
            <span className="quote-line-total">{formatGBP(sheet.total_price)}</span>
          </div>
        </div>
        {sheet.terms && (
          <div className="kv" style={{ marginTop: 14 }}>
            <div className="k">Terms</div>
            <div className="v">{sheet.terms}</div>
          </div>
        )}
      </div>

      {!alreadyDecided && (
        <div className="panel no-print">
          <h2>Your response</h2>

          {choice === null && (
            <>
              <p className="hint">
                Have a look over the costs above, then choose one. Nothing is sent until you confirm
                on the next step.
              </p>
              <div className="decision-options">
                <button type="button" className="decision-card" onClick={() => { setError(''); setChoice('approved'); }}>
                  <span className="decision-title">Approve this quote</span>
                  <span className="decision-desc">The costs are agreed and we can go ahead and book the work in.</span>
                </button>
                <button type="button" className="decision-card" onClick={() => { setError(''); setChoice('changes_requested'); }}>
                  <span className="decision-title">Request changes</span>
                  <span className="decision-desc">Something needs adjusting or removing. Tell us what and we&apos;ll send a revised quote.</span>
                </button>
              </div>
            </>
          )}

          {choice === 'approved' && (
            <>
              <div className="decision-summary">
                <div className="decision-summary-title">You&apos;re approving</div>
                <div>
                  {items.length} line{items.length === 1 ? '' : 's'} totalling {formatGBP(sheet.total_price)}, excluding VAT
                  {sheet.site_location ? `, at ${sheet.site_location}` : ''}.
                </div>
                {comment.trim() && (
                  <div className="decision-summary-flag">
                    You started writing a change request. Approving won&apos;t send it — go back and
                    choose Request changes if you meant to.
                  </div>
                )}
              </div>
              <div className="field-row">
                <div className="field"><label className="req">Your Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
              </div>
              {error && <p className="error-text">{error}</p>}
              <div className="actions-row" style={{ marginBottom: 0 }}>
                <button className="btn btn-ghost" type="button" disabled={submitting} onClick={() => { setError(''); setChoice(null); }}>Back</button>
                <button className="btn btn-primary" type="button" disabled={submitting} onClick={() => decide('approved')}>
                  {submitting ? 'Sending…' : 'Confirm approval'}
                </button>
              </div>
            </>
          )}

          {choice === 'changes_requested' && (
            <>
              <p className="hint">
                Tell us what needs changing — which line, and what you&apos;d like instead. We&apos;ll come
                back with a revised quote.
              </p>
              <div className="field-row">
                <div className="field"><label className="req">Your Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
              </div>
              <div className="field-row">
                <div className="field" style={{ flex: '1 1 100%' }}>
                  <label className="req">What needs changing?</label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="e.g. We only need two screens in reception, not three."
                  />
                </div>
              </div>
              {error && <p className="error-text">{error}</p>}
              <div className="actions-row" style={{ marginBottom: 0 }}>
                <button className="btn btn-ghost" type="button" disabled={submitting} onClick={() => { setError(''); setChoice(null); }}>Back</button>
                <button className="btn btn-primary" type="button" disabled={submitting} onClick={() => decide('changes_requested')}>
                  {submitting ? 'Sending…' : 'Send change request'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
