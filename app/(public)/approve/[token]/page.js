'use client';

import { use, useEffect, useState } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { PhotoWithOverlay } from '../../../../components/PhotoWithOverlay';
import { BlueprintDiagram } from '../../../../components/BlueprintDiagram';
import { SCREEN_SIZES } from '../../../../lib/screenSizes';
import { formatDate, formatDateTime } from '../../../../lib/formatDate';
import { formatBytes } from '../../../../lib/formatBytes';

// Same Yes/No rendering as the internal report, so the client reads each answer
// exactly as the PM who sent the link sees it.
function pill(val) {
  if (val === 'Yes') return <span className="status-pill status-yes">Yes</span>;
  if (val === 'No') return <span className="status-pill status-no">No</span>;
  return <span className="status-pill">—</span>;
}

// Every file on this page goes through the same token-checked route, which
// confirms the path belongs to this survey before signing it.
function fileUrl(token, path) {
  return `/api/approval-photo?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`;
}

// The client-facing approval page. No account, no login — whoever holds the
// link sees this one survey and can approve it or ask for changes.
//
// WHAT IT SHOWS
// Exactly what the Client PDF shows, so "client-facing" means one thing across
// the app: survey date, site contact, address and attachments, then for every
// area its photo, scale drawing, and each screen's power, data/4G and notes.
//
// Engineer name and phone, resourcing estimates and internal notes are never
// shown — and get_survey_for_approval() never selects them (migration 034), so
// they can't leak here the way they could if this page reused the report and
// hid fields with CSS.
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
  // Which path the client is on: null while choosing, then 'approved' or
  // 'changes_requested'. The decision is its own first step, so there is never
  // one form with two competing buttons.
  const [choice, setChoice] = useState(null);
  // Files are served through an API route that needs the service-role key.
  // Probe it once rather than rendering a page full of broken image icons when
  // the key isn't configured.
  const [photosOk, setPhotosOk] = useState(null);

  useEffect(() => {
    supabase.rpc('get_survey_for_approval', { p_token: token }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] || null : data || null;
      setSurvey(row);
      setLookupDone(true);

      // Probe whichever file this survey has first — area photo, then an extra
      // photo, then an attachment. Probing area photos alone meant a survey
      // whose only files were attachments reported "unavailable" even with
      // sharing configured.
      const areaList = row?.locations || [];
      const firstPath =
        areaList.find((a) => a.photo_path)?.photo_path
        || areaList.flatMap((a) => a.additional_photos || [])[0]
        || (row?.attachments || [])[0]?.path;
      if (!firstPath) {
        setPhotosOk(false);
        return;
      }
      fetch(fileUrl(token, firstPath))
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
      // Comment text only belongs to a change request. If it was typed on the
      // changes path and the client then chose approve, the confirm step has
      // already told them it won't be sent.
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
  // Absent before migration 034 runs, so the page degrades to "no attachments"
  // rather than failing.
  const attachments = survey.attachments || [];
  const allScreens = areas.flatMap((a) => a.screens || []);
  const totalScreens = allScreens.length;
  const noPower = allScreens.filter((sc) => sc.power === 'No').length;
  const noData = allScreens.filter((sc) => sc.data_port === 'No').length;

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
          <div className="kv"><div className="k">Site Contact</div><div className="v">{survey.site_contact || '—'}</div></div>
          <div className="kv"><div className="k">Address</div><div className="v">{survey.address || '—'}</div></div>
          <div className="kv"><div className="k">Screen Areas</div><div className="v">{areas.length}</div></div>
        </div>
        {attachments.length > 0 && (
          <div className="kv" style={{ borderColor: 'var(--accent-cyan)' }}>
            <div className="k">Attachments</div>
            <div className="attachment-list" style={{ marginTop: 6 }}>
              {attachments.map((a, i) => (
                <div className="attachment-row" key={i}>
                  {/* Linked only once file sharing is confirmed working — a
                      link that 503s is worse than a plain filename. */}
                  {photosOk === true && a.path ? (
                    <a className="attachment-name" href={fileUrl(token, a.path)} target="_blank" rel="noreferrer">{a.name}</a>
                  ) : (
                    <span className="attachment-name">{a.name}</span>
                  )}
                  {a.size ? <span className="attachment-size">{formatBytes(a.size)}</span> : null}
                </div>
              ))}
            </div>
          </div>
        )}
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
        // Custom LED walls carry their own dimensions; everything else takes
        // them from the model — the same rule the internal report uses.
        const wmm = area.screen_size === 'other' ? (Number(area.custom_w) || null) : sizeInfo?.wmm;
        const hmm = area.screen_size === 'other' ? (Number(area.custom_h) || null) : sizeInfo?.hmm;
        const screens = area.screens || [];
        const extras = area.additional_photos || [];
        const hasAnyPhoto = Boolean(area.photo_path) || extras.length > 0;
        return (
          <div className="panel" key={i}>
            <h2>
              Area #{i + 1}{area.area_name ? ` — ${area.area_name}` : ''}
              <span className="area-screen-count">
                {screens.length} screen{screens.length !== 1 ? 's' : ''}{sizeInfo ? ` · ${sizeInfo.label}` : ''}
              </span>
            </h2>
            <div className="loc-body">
              <div>
                <div className="kv-grid">
                  <div className="kv"><div className="k">Orientation</div><div className="v">{area.orientation || '—'}</div></div>
                  <div className="kv"><div className="k">Model</div><div className="v">{sizeInfo ? sizeInfo.model : '—'}</div></div>
                  <div className="kv">
                    <div className="k">Mount Type</div>
                    <div className="v">{area.mount_type === 'Other' ? (area.mount_type_other || 'Other') : (area.mount_type || '—')}</div>
                  </div>
                </div>
                <div className="kv"><div className="k">Measurements</div><div className="v">{area.measurements || '—'}</div></div>

                {area.photo_path && photosOk === true && (
                  <PhotoWithOverlay
                    photoSrc={fileUrl(token, area.photo_path)}
                    overlays={area.screen_overlays}
                    readOnly
                  />
                )}
                {/* One note per area, not one per file, whichever kind of photo
                    it has. */}
                {hasAnyPhoto && photosOk === false && (
                  <div className="empty-state" style={{ padding: '20px 0' }}>
                    Photos unavailable — please ask your Linney contact to send them across.
                  </div>
                )}

                {/* Per screen, the way the report lays it out: a client
                    approving a layout needs to see that screen 2 has no power,
                    not a flattened list of notes with no screen attached to
                    them. */}
                {screens.length > 0 && (
                  <div className="report-screens">
                    {screens.map((s, si) => (
                      <div className="report-screen" key={si}>
                        <div className="report-screen-num">Screen {si + 1}</div>
                        <div className="kv-grid">
                          <div className="kv"><div className="k">Power Available</div><div className="v">{pill(s.power)}</div></div>
                          <div className="kv"><div className="k">Data / 4G Available</div><div className="v">{pill(s.data_port)}</div></div>
                        </div>
                        {s.notes && (
                          <div className="kv" style={{ borderColor: 'var(--accent-cyan)' }}>
                            <div className="k">Notes</div>
                            <div className="v">{s.notes}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {extras.length > 0 && photosOk === true && (
                  <>
                    <div className="k" style={{ marginTop: 14, marginBottom: 6 }}>Additional Photos</div>
                    <div className="additional-photos-grid">
                      {extras.map((path, idx) => (
                        <a
                          href={fileUrl(token, path)}
                          target="_blank"
                          rel="noreferrer"
                          key={idx}
                          className="additional-photo-thumb static"
                        >
                          <img src={fileUrl(token, path)} alt={`Additional photo ${idx + 1}`} />
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <BlueprintDiagram wmm={wmm} hmm={hmm} orientation={area.orientation} />
            </div>
          </div>
        );
      })}

      {!alreadyDecided && (
        <div className="panel no-print">
          <h2>Your response</h2>

          {/* Step 1 — decide. Two separate choices rather than one form with two
              buttons: a comment box sitting above a blue "Approve" button reads
              like "type your feedback, then submit", which is exactly how a
              change request once got recorded as an approval. */}
          {choice === null && (
            <>
              <p className="hint">
                Have a look over every area above, then choose one. Nothing is sent until you confirm
                on the next step.
              </p>
              <div className="decision-options">
                <button type="button" className="decision-card" onClick={() => { setError(''); setChoice('approved'); }}>
                  <span className="decision-title">Approve this layout</span>
                  <span className="decision-desc">Everything above is right, and we can go ahead and book the installation.</span>
                </button>
                <button type="button" className="decision-card" onClick={() => { setError(''); setChoice('changes_requested'); }}>
                  <span className="decision-title">Request changes</span>
                  <span className="decision-desc">Something needs moving, adding or checking. Tell us what and we&apos;ll send a revised survey.</span>
                </button>
              </div>
            </>
          )}

          {/* Step 2a — confirm an approval. This is the prompt: it states what is
              being approved, in numbers, before anything is recorded. An
              approval is what lets the work be booked, and this page offers no
              way to take one back. */}
          {choice === 'approved' && (
            <>
              <div className="decision-summary">
                <div className="decision-summary-title">You&apos;re approving</div>
                <div>
                  {areas.length} area{areas.length === 1 ? '' : 's'} and {totalScreens} screen{totalScreens === 1 ? '' : 's'} at {survey.site_location}.
                </div>
                {/* The fact most worth a second look before signing off: a
                    screen with nowhere to plug in. */}
                {(noPower > 0 || noData > 0) && (
                  <div className="decision-summary-flag">
                    {[
                      noPower > 0 ? `${noPower} screen${noPower === 1 ? ' has' : 's have'} no power available` : null,
                      noData > 0 ? `${noData} screen${noData === 1 ? ' has' : 's have'} no data or 4G connection` : null,
                    ].filter(Boolean).join(', and ')}. If that needs sorting before we install, go back and
                    choose Request changes instead.
                  </div>
                )}
                {/* Typed on the changes path, then came back and chose approve.
                    The text isn't sent with an approval, so say so rather than
                    drop it silently. */}
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
                <button className="btn btn-ghost" type="button" disabled={submitting} onClick={() => { setError(''); setChoice(null); }}>
                  Back
                </button>
                <button className="btn btn-primary" type="button" disabled={submitting} onClick={() => decide('approved')}>
                  {submitting ? 'Sending…' : 'Confirm approval'}
                </button>
              </div>
            </>
          )}

          {/* Step 2b — the change request. The comment box only exists on this
              path, so writing in it can never end up attached to an approval. */}
          {choice === 'changes_requested' && (
            <>
              <p className="hint">
                Tell us what needs changing — which area, and what you&apos;d like instead. We&apos;ll come
                back with a revised survey.
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
                    placeholder="e.g. Area 1 — could screen 2 move 50cm to the left, clear of the door?"
                  />
                </div>
              </div>
              {error && <p className="error-text">{error}</p>}
              <div className="actions-row" style={{ marginBottom: 0 }}>
                <button className="btn btn-ghost" type="button" disabled={submitting} onClick={() => { setError(''); setChoice(null); }}>
                  Back
                </button>
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
