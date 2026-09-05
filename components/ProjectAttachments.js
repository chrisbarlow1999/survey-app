'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { uploadAttachments, newAttachmentItems } from '../lib/uploadAttachments';
import { logProjectActivity } from '../lib/logProjectActivity';
import { formatBytes } from '../lib/formatBytes';
import { MAX_ATTACHMENT_BYTES } from './AttachmentPicker';

// Attachments managed in place, so the project page is the whole project and
// there's no separate Edit screen to remember. Files upload as soon as they're
// picked rather than on a Save button — there is no Save button here.
export function ProjectAttachments({ projectId, attachments, existing, actorName, readOnly }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function addFiles(fileList) {
    if (!fileList || !fileList.length) return;
    const picked = Array.from(fileList);
    const tooBig = picked.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    const ok = picked.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    if (tooBig.length) {
      setError(`Skipped ${tooBig.map((f) => f.name).join(', ')} — over ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
    } else {
      setError('');
    }
    if (!ok.length) return;

    setBusy(true);
    try {
      const uploaded = await uploadAttachments(supabase, newAttachmentItems(ok));
      // `existing` is the stored shape (path/name/size), not the signed-URL
      // version rendered below — writing the signed URLs back would persist
      // links that expire in an hour.
      const next = [...existing, ...uploaded];
      const { error: updErr } = await supabase.from('projects').update({ attachments: next }).eq('id', projectId);
      if (updErr) throw updErr;
      await logProjectActivity(supabase, {
        projectId, actorName, action: 'Attachment added', detail: ok.map((f) => f.name).join(', '),
      });
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Could not upload that file.');
    }
    setBusy(false);
  }

  async function remove(item) {
    if (!confirm(`Remove ${item.name}? The file is deleted permanently.`)) return;
    setBusy(true);
    setError('');
    const next = existing.filter((a) => a.path !== item.path);
    const { error: updErr } = await supabase.from('projects').update({ attachments: next }).eq('id', projectId);
    if (updErr) {
      console.error(updErr);
      setError('Could not remove that file.');
      setBusy(false);
      return;
    }
    // Storage cleanup is best-effort; the row is already correct either way.
    supabase.storage.from('survey-photos').remove([item.path]).catch(() => {});
    await logProjectActivity(supabase, { projectId, actorName, action: 'Attachment removed', detail: item.name });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="panel">
      <h2>Attachments {attachments.length > 0 && <span className="panel-count">{attachments.length}</span>}</h2>
      <p className="hint">Briefs, floor plans, spec sheets. Up to {formatBytes(MAX_ATTACHMENT_BYTES)} each.</p>

      {error && <p className="error-text">{error}</p>}

      {attachments.length === 0 && <div className="empty-state">No files attached.</div>}

      {attachments.length > 0 && (
        <div className="attachment-list">
          {attachments.map((a, i) => (
            <div className="attachment-row" key={a.path || i}>
              {a.url ? (
                <a className="attachment-name" href={a.url} target="_blank" rel="noreferrer">{a.name}</a>
              ) : (
                <span className="attachment-name">{a.name}</span>
              )}
              <span className="attachment-size">{formatBytes(a.size)}</span>
              {!readOnly && (
                <button type="button" className="attachment-remove" onClick={() => remove(a)} disabled={busy}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <label className={`attachment-add${busy ? ' busy' : ''}`}>
          <input
            type="file"
            multiple
            disabled={busy}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <span>{busy ? 'Uploading…' : '+ Add files'}</span>
        </label>
      )}
    </div>
  );
}
