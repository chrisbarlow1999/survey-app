'use client';

// One area ("Bar wall") with each screen in it signed off separately — the
// proof photo is per screen, since that's the evidence the install happened.
export function InstallAreaCard({
  area, index, showRemove, onRemove, onChange,
  onAddScreen, onRemoveScreen, onScreenChange, onScreenPhotoChange,
}) {
  const screenCount = area.screens.length;
  return (
    <div className="loc-card">
      <div className="loc-head">
        <div className="loc-num">
          Area #{index + 1}
          {area.areaName ? ` — ${area.areaName}` : ''}
          <span className="area-screen-count">{screenCount} screen{screenCount !== 1 ? 's' : ''}</span>
        </div>
        {showRemove && <button type="button" className="remove" onClick={onRemove}>Remove</button>}
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: '1 1 100%' }}>
          <label>Area Name</label>
          <input value={area.areaName} onChange={(e) => onChange('areaName', e.target.value)} placeholder="e.g. Reception, Main entrance, Bar wall" />
        </div>
      </div>

      <div className="screen-list">
        <label className="screen-list-label">Screens in this Area</label>
        {area.screens.map((screen, si) => (
          <div className="screen-row" key={screen.id}>
            <div className="screen-row-head">
              <span className="screen-row-num">Screen {si + 1}</span>
              {area.screens.length > 1 && (
                <button type="button" className="remove" onClick={() => onRemoveScreen(screen.id)}>Remove</button>
              )}
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: '1 1 100%' }}>
                <label>Proof Photo</label>
                <input type="file" accept="image/*" onChange={(e) => { onScreenPhotoChange(screen.id, e.target.files[0]); e.target.value = ''; }} />
                {screen.photoPreview && (
                  <img src={screen.photoPreview} alt="Installed screen" className="install-proof-photo" />
                )}
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Installed?</label>
                <div className="segmented">
                  <button type="button" className={screen.installed === 'Yes' ? 'on' : ''} onClick={() => onScreenChange(screen.id, 'installed', 'Yes')}>Yes</button>
                  <button type="button" className={screen.installed === 'No' ? 'on warn' : ''} onClick={() => onScreenChange(screen.id, 'installed', 'No')}>No</button>
                </div>
              </div>
            </div>
            <div className="field-row" style={{ marginBottom: 0 }}>
              <div className="field" style={{ flex: '1 1 100%' }}>
                <label>Notes (issues encountered, changes from the original survey, etc.)</label>
                <textarea value={screen.notes} onChange={(e) => onScreenChange(screen.id, 'notes', e.target.value)} />
              </div>
            </div>
          </div>
        ))}
        <button type="button" className="btn-add" onClick={onAddScreen}>+ Add Screen to This Area</button>
      </div>
    </div>
  );
}
