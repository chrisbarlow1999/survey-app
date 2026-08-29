'use client';

export function InstallLocationCard({ loc, index, showRemove, onRemove, onChange, onPhotoChange }) {
  return (
    <div className="loc-card">
      <div className="loc-head">
        <div className="loc-num">Screen #{index + 1}</div>
        {showRemove && <button type="button" className="remove" onClick={onRemove}>Remove</button>}
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: '1 1 100%' }}>
          <label>Screen Label (optional — helps match this back to the original survey)</label>
          <input value={loc.label} onChange={(e) => onChange('label', e.target.value)} placeholder="e.g. Front entrance, Reception" />
        </div>
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: '1 1 100%' }}>
          <label>Proof Photo</label>
          <input type="file" accept="image/*" onChange={(e) => { onPhotoChange(e.target.files[0]); e.target.value = ''; }} />
          {loc.photoPreview && (
            <img src={loc.photoPreview} alt="Installed screen" className="install-proof-photo" />
          )}
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Installed?</label>
          <div className="segmented">
            <button type="button" className={loc.installed === 'Yes' ? 'on' : ''} onClick={() => onChange('installed', 'Yes')}>Yes</button>
            <button type="button" className={loc.installed === 'No' ? 'on warn' : ''} onClick={() => onChange('installed', 'No')}>No</button>
          </div>
        </div>
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: '1 1 100%' }}>
          <label>Notes (issues encountered, changes from the original survey, etc.)</label>
          <textarea value={loc.notes} onChange={(e) => onChange('notes', e.target.value)} />
        </div>
      </div>
    </div>
  );
}
