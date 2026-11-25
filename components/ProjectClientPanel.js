'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { uploadAttachments, newAttachmentItems } from '../lib/uploadAttachments';
import { logProjectActivity } from '../lib/logProjectActivity';
import { formatBytes } from '../lib/formatBytes';
import { describeRequestAnswers, describeAccessAnswers, ramsLabel } from '../lib/intakeQuestions';
import { trackingPath } from '../lib/clientTracking';
import { MAX_ATTACHMENT_BYTES } from './AttachmentPicker';
import { CopyLinkField } from './CopyLinkField';

const RAMS_OPTIONS = [
  { value: true, label: 'Required' },
  { value: false, label: 'Not required' },
  { value: null, label: 'Not specified' },
];

// Everything on a project that faces the client: their tracking link, the site
// access answers from the request form, and RAMS.
//
// RAMS files live in their own column (rams_files), not in Attachments, because
// they're shown to the client on the tracking page and Attachments is not.
export function ProjectClientPanel({ project, ramsFiles, siteCount = 0, actorName, readOnly }) {
  const supabase = createClient();
  const router = useRouter();
  const [ramsRequired, setRamsRequired] = useState(project.rams_required ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Before migration 043 none of these columns exist.
  if (project.tracking_token === undefined) {
    return (
      <div className="panel">
        <h2>Client View</h2>
        <p className="hint">Run <code>supabase/043_client_tracking.sql</code> to switch on client tracking links and RAMS.</p>
      </div>
    );
  }

  // Budget / delivery / content (052) and, on older requests, site access.
  const requestAnswers = describeRequestAnswers(project.intake_answers);
  const answers = describeAccessAnswers(project.intake_answers);
  const storedRams = project.rams_files || [];
  const ramsMissing = ramsRequired === true && storedRams.length === 0;
  // Once a project has sites, access answers and RAMS are recorded per site
  // (migration 044). The project-level ones are only shown if something was
  // already recorded there before the sites were added.
  const projectLevelRams = siteCount === 0 || ramsRequired !== null || storedRams.length > 0;

  async function setRams(value) {
    if (value === ramsRequired) return;
    const previous = ramsRequired;
    setRamsRequired(value);
    setError('');
    const { error: updErr } = await supabase.from('projects').update({ rams_required: value }).eq('id', project.id);
    if (updErr) {
      console.error(updErr);
      setRamsRequired(previous);
      setError('Could not save that.');
      return;
    }
    await logProjectActivity(supabase, { projectId: project.id, actorName, action: 'RAMS', detail: ramsLabel(value) });
    router.refresh();
  }

  async function addFiles(fileList) {
    if (!fileList || !fileList.length) return;
    const picked = Array.from(fileList);
    const tooBig = picked.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    const ok = picked.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    setError(tooBig.length ? `Skipped ${tooBig.map((f) => f.name).join(', ')} — over ${formatBytes(MAX_ATTACHMENT_BYTES)}.` : '');
    if (!ok.length) return;
    setBusy(true);
    try {
      const uploaded = await uploadAttachments(supabase, newAttachmentItems(ok));
      const { error: updErr } = await supabase
        .from('projects')
        .update({ rams_files: [...storedRams, ...uploaded] })
        .eq('id', project.id);
      if (updErr) throw updErr;
      await logProjectActivity(supabase, {
        projectId: project.id, actorName, action: 'RAMS uploaded', detail: ok.map((f) => f.name).join(', '),
      });
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Could not upload that file.');
    }
    setBusy(false);
  }

  async function removeFile(item) {
    if (!confirm(`Remove ${item.name}? The client will no longer be able to download it, and the file is deleted.`)) return;
    setBusy(true);
    setError('');
    const next = storedRams.filter((a) => a.path !== item.path);
    const { error: updErr } = await supabase.from('projects').update({ rams_files: next }).eq('id', project.id);
    if (updErr) {
      console.error(updErr);
      setError('Could not remove that file.');
      setBusy(false);
      return;
    }
    supabase.storage.from('survey-photos').remove([item.path]).catch(() => {});
    await logProjectActivity(supabase, { projectId: project.id, actorName, action: 'RAMS removed', detail: item.name });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="panel">
      <h2>
        Client View
        {ramsMissing && <span className="client-badge intake-badge" style={{ marginLeft: 8 }}>RAMS needed</span>}
      </h2>

      <div className="client-panel-section">
        <div className="k">Tracking link</div>
        <p className="hint" style={{ margin: '2px 0 8px' }}>
          The client&apos;s private page: stage, key dates, tasks ticked &ldquo;show to client&rdquo;, RAMS and what they
          submitted. Never notes, activity, owner or value. Anyone with the link can open it.
        </p>
        <CopyLinkField path={trackingPath(project.tracking_token)} />
        <a className="btn btn-ghost" href={trackingPath(project.tracking_token)} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>
          Preview as client
        </a>
      </div>

      {requestAnswers.length > 0 && (
        <div className="client-panel-section">
          <div className="k">Delivery, budget &amp; content (from the request)</div>
          <dl className="intake-answer-list">
            {requestAnswers.map((a) => (
              <div key={a.key} className="intake-answer" style={a.depth ? { paddingLeft: 14 * a.depth } : undefined}>
                <dt>{a.label}</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{a.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {answers.length > 0 && (
        <div className="client-panel-section">
          <div className="k">Site access (from the request)</div>
          <dl className="intake-answer-list">
            {answers.map((a) => (
              <div key={a.key} className="intake-answer" style={a.depth ? { paddingLeft: 14 * a.depth } : undefined}>
                <dt>{a.label}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {!projectLevelRams && (
        <div className="client-panel-section">
          <div className="k">Site access &amp; RAMS</div>
          <p className="hint" style={{ margin: '2px 0 0' }}>Recorded per site — see Sites above.</p>
        </div>
      )}

      {projectLevelRams && (
      <div className="client-panel-section">
        <div className="k">{siteCount > 0 ? 'RAMS (whole project)' : 'RAMS'}</div>
        {readOnly ? (
          <div className="v">{ramsLabel(ramsRequired)}</div>
        ) : (
          <div className="segmented" role="group" aria-label="RAMS required" style={{ marginTop: 6 }}>
            {RAMS_OPTIONS.map((o) => (
              <button
                key={String(o.value)}
                type="button"
                className={ramsRequired === o.value ? 'on' : ''}
                aria-pressed={ramsRequired === o.value}
                onClick={() => setRams(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        {ramsMissing && (
          <p className="hint" style={{ color: 'var(--caution)', margin: '8px 0 0' }}>
            The client asked for RAMS and none have been uploaded yet. Their page says they&apos;re being prepared.
          </p>
        )}

        {ramsFiles.length > 0 && (
          <div className="attachment-list" style={{ marginTop: 10 }}>
            {ramsFiles.map((a) => (
              <div className="attachment-row" key={a.path}>
                {a.url ? (
                  <a className="attachment-name" href={a.url} target="_blank" rel="noreferrer">{a.name}</a>
                ) : (
                  <span className="attachment-name">{a.name}</span>
                )}
                <span className="attachment-size">{formatBytes(a.size)}</span>
                {!readOnly && (
                  <button type="button" className="attachment-remove" onClick={() => removeFile(a)} disabled={busy}>Remove</button>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <label className={`attachment-add${busy ? ' busy' : ''}`} style={{ marginTop: 10 }}>
            <input type="file" multiple disabled={busy} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            <span>{busy ? 'Uploading…' : ramsRequired === true ? '+ Upload RAMS' : '+ Upload RAMS (optional)'}</span>
          </label>
        )}
        {!readOnly && <p className="hint" style={{ margin: '6px 0 0' }}>Files here can be downloaded by the client from their tracking link.</p>}
      </div>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
