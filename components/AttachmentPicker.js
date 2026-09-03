'use client';

import { formatBytes } from '../lib/formatBytes';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB each

// Record-level files (floor plans, PDFs, spec sheets) — separate from the
// per-location photos. Items are either { key, file } for newly picked files
// or { key, existingPath, name, size } for ones already saved.
export function AttachmentPicker({ attachments, onAdd, onRemove, label, hint }) {
  function handleChange(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;

    const tooBig = picked.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig.length) {
      alert(`These files are over ${formatBytes(MAX_ATTACHMENT_BYTES)} and were skipped:\n${tooBig.map((f) => f.name).join('\n')}`);
    }
    const ok = picked.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    if (ok.length) onAdd(ok);
  }

  return (
    <div className="field" style={{ flex: '1 1 100%' }}>
      <label>{label}</label>
      <input type="file" multiple onChange={handleChange} />
      <p className="hint" style={{ margin: '6px 0 0' }}>{hint}</p>
      {attachments.length > 0 && (
        <div className="attachment-list">
          {attachments.map((a) => (
            <div className="attachment-row" key={a.key}>
              <span className="attachment-name">{a.name || a.file?.name}</span>
              <span className="attachment-size">{formatBytes(a.size ?? a.file?.size)}</span>
              <button type="button" className="attachment-remove" onClick={() => onRemove(a.key)} aria-label="Remove attachment">&times;</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
