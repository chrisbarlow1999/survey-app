'use client';

import { use, useEffect, useState } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { PhotoWithOverlay } from '../../../../components/PhotoWithOverlay';
import { SCREEN_SIZES } from '../../../../lib/screenSizes';
import { formatDate, formatDateTime } from '../../../../lib/formatDate';

// The client-facing approval page. No account, no login — whoever holds the
// link sees this one survey and can approve it or ask for changes.
//
// Everything comes from get_survey_for_approval(), which is the entire public
// surface: it never selects the engineer's phone, the resourcing estimates or
// the internal notes, so those can't leak here the way they could if this page
// simply reused the report and hid fields with CSS.
export default function ApprovalPage({ params }) {
  const { token } = use(params);
  const supabase = createClient();

  const [survey, setSurvey] = useState(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [decided, setDecided] = useState(null);
  // Photos are served through an API route that needs the service-role key.
  // Probe it once rather than rendering a page full of broken image icons when
  // the key isn't configured.
  const [photosOk, setPhotosOk] = useState(null);

  useEffect(() => {
    supabase.rpc('get_survey_for_approval', { p_token: token }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] || null : data || null;
      setSurvey(row);
      setLookupDone(true);

      const firstPhoto = (row?.locations || []).find((a) => a.photo_path)?.photo_path;
      if (!firstPhoto) {
        setPhotosOk(false);
        return;
      }
      fetch(`/api/approval-photo?token=${encodeURIComponent(token)}&path=${encodeURIComponent(firstPhoto)}`)
        .then((res) => setPhotosOk(res.ok))
        .catch(() => setPhotosOk(false));
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
    const { data, error: rpcErr } = await supabase.rpc('submit_survey_approval', {
      p_token: token,
      p_decision: decision,
      p_name: name,
      p_comment: comment,
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

  // Deliberately vague, same as the request form: an unknown token and a
  // withdrawn one look identical.
  if (!survey) {
    return (
      <main>
        <div className="panel">
          <h2>This link isn&apos;t active</h2>
          <p className="hint">
            It may have been withdrawn or replaced. Please get in touch with your Linney contact
            for an up-to-date link.
          </p>
        </div>
      </main>
    );
  }

  const alreadyDecided = decided || (survey.approval_status !== 'awaiting' ? survey.approval_status : null);
  const areas = survey.locations || [];

  return (
    <main>
      <div className="panel">
        <h2 style={{ fontSize: 20 }}>
          {survey.site_location}
          {survey.client_name ? <span className="client-badge" style={{ marginLeft: 10, verticalAlign: 'middle' }}>{survey.client_name}</span> : null}
        </h2>
        <p className="hint">
          Please review the proposed screen positions below and let us know whether you&apos;re happy
          to proceed.
        </p>
        <div className="kv-grid">
          <div className="kv"><div className="k">Survey Date</div><div className="v">{formatDate(survey.survey_date)}</div></div>
          <div className="kv"><div className="k">Address</div><div className="v">{survey.address || '—'}</div></div>
          <div className="kv"><div className="k">Areas</div><div className="v">{areas.length}</div></div>
        </div>
      </div>

      {alreadyDecided && (
        <div className={`panel ${alreadyDecided === 'approved' ? 'success-panel' : ''}`}>
          <h2>{alreadyDecided === 'approved' ? 'Approved' : 'Changes requested'}</h2>
          <p className="hint" style={{ margin: 0 }}>
            {decided
              ? 'Thanks — your response has been sent to the project team.'
              : `Recorded${survey.approval_name ? ` by ${survey.approval_name}` : ''}${survey.approval_decided_at ? ` on ${formatDateTime(survey.approval_decided_at)}` : ''}.`}
          </p>
          {!decided && survey.approval_comment && (
            <div className="kv" style={{ marginTop: 12 }}>
              <div className="k">Comments</div>
              <div className="v">{survey.approval_comment}</div>
            </div>
          )}
        </div>
      )}

      {areas.map((area, i) => {
        const sizeInfo = SCREEN_SIZES[area.screen_size];
        const screens = area.screens || [];
        return (
          <div className="panel" key={i}>
            <h2>
              Area #{i + 1}{area.area_name ? ` — ${area.area_name}` : ''}
              <span className="area-screen-count">
                {screens.length} screen{screens.length !== 1 ? 's' : ''}{sizeInfo ? ` · ${sizeInfo.label}` : ''}
              </span>
            </h2>
            <div className="kv-grid">
              <div className="kv"><div className="k">Orientation</div><div className="v">{area.orientation || '—'}</div></div>
              <div className="kv"><div className="k">Model</div><div className="v">{sizeInfo ? sizeInfo.model : '—'}</div></div>
              <div className="kv">
                <div className="k">Mount Type</div>
                <div className="v">{area.mount_type === 'Other' ? (area.mount_type_other || 'Other') : (area.mount_type || '—')}</div>
              </div>
            </div>
            {area.measurements && (
              <div className="kv"><div className="k">Measurements</div><div className="v">{area.measurements}</div></div>
            )}
            {area.photo_path && photosOk === true && (
              <PhotoWithOverlay
                photoSrc={`/api/approval-photo?token=${encodeURIComponent(token)}&path=${encodeURIComponent(area.photo_path)}`}
                overlays={area.screen_overlays}
                readOnly
              />
            )}
            {area.photo_path && photosOk === false && (
              <div className="empty-state" style={{ padding: '20px 0' }}>
                Photo unavailable — please ask your Linney contact to send it across.
              </div>
            )}
            {screens.some((s) => s.notes) && (
              <div className="kv" style={{ borderColor: 'var(--accent-cyan)', marginTop: 12 }}>
                <div className="k">Notes</div>
                <div className="v">
                  {screens.filter((s) => s.notes).map((s, si) => <div key={si}>{s.notes}</div>)}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {!alreadyDecided && (
        <div className="panel">
          <h2>Your response</h2>
          <p className="hint">
            Approving lets us book the work in. If anything isn&apos;t right, tell us what to change
            and we&apos;ll come back with a revised survey.
          </p>
          <div className="field-row">
            <div className="field"><label className="req">Your Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Comments</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Required if you're asking for changes."
              />
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="actions-row" style={{ marginBottom: 0 }}>
            <button className="btn btn-ghost" type="button" disabled={submitting} onClick={() => decide('changes_requested')}>
              Request changes
            </button>
            <button className="btn btn-primary" type="button" disabled={submitting} onClick={() => decide('approved')}>
              {submitting ? 'Sending…' : 'Approve'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
