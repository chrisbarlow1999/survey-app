'use client';

import { SCREEN_SIZES, MOUNT_TYPES } from '../lib/screenSizes';
import { BlueprintDiagram } from './BlueprintDiagram';
import { PhotoWithOverlay } from './PhotoWithOverlay';

// One area (e.g. "Reception wall") holding several screens. Size, orientation
// and mount type are shared across the area — an area mixing screen sizes is
// two areas. Power, data and wall notes are per-screen, since a socket may sit
// behind screen 1 and not screen 3.
//
// Screens and markers are kept 1:1: adding a screen adds a box on the photo,
// removing one takes its box away. The marker label is the screen number.
export function AreaCard({
  area, index, showRemove, onRemove, onChange,
  onPhotoChange, onAdditionalPhotosAdd, onAdditionalPhotoRemove,
  onAddScreen, onRemoveScreen, onScreenChange,
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
      <div className="loc-body">
        <div>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Area Name</label>
              <input value={area.areaName} onChange={(e) => onChange('areaName', e.target.value)} placeholder="e.g. Reception, Main entrance, Bar wall" />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Photo of Area</label>
              <input type="file" accept="image/*" onChange={(e) => { onPhotoChange(e.target.files[0]); e.target.value = ''; }} />
              {area.photoPreview && (
                <>
                  <PhotoWithOverlay
                    photoSrc={area.photoPreview}
                    overlays={area.screenOverlays}
                    onOverlaysChange={(list) => onChange('screenOverlays', list)}
                  />
                  <p className="hint" style={{ margin: '6px 0 0' }}>
                    One amber box per screen — drag each onto the photo to show where it goes, and drag its
                    corner handle to resize. Add or remove screens below to change how many boxes there are.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Screen Size</label>
              <select value={area.sizeKey} onChange={(e) => onChange('sizeKey', e.target.value)}>
                <option value="">Please select</option>
                {Object.entries(SCREEN_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Orientation</label>
              <div className="segmented">
                <button type="button" className={area.orientation === 'Landscape' ? 'on' : ''} onClick={() => onChange('orientation', 'Landscape')}>Landscape</button>
                <button type="button" className={area.orientation === 'Portrait' ? 'on' : ''} onClick={() => onChange('orientation', 'Portrait')}>Portrait</button>
              </div>
            </div>
          </div>
          {area.sizeKey === 'other' && (
            <div className="field-row">
              <div className="field"><label>Custom Width (mm)</label><input type="number" value={area.customW} onChange={(e) => onChange('customW', e.target.value)} /></div>
              <div className="field"><label>Custom Height (mm)</label><input type="number" value={area.customH} onChange={(e) => onChange('customH', e.target.value)} /></div>
            </div>
          )}
          <div className="field-row">
            <div className="field">
              <label>Mount Type</label>
              <select value={area.mountType} onChange={(e) => onChange('mountType', e.target.value)}>
                <option value="">Please select</option>
                {MOUNT_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {area.mountType === 'Other' && (
              <div className="field">
                <label>Specify Mount Type</label>
                <input value={area.mountTypeOther} onChange={(e) => onChange('mountTypeOther', e.target.value)} placeholder="e.g. Freestanding kiosk" />
              </div>
            )}
          </div>
          <p className="hint" style={{ margin: '-4px 0 14px' }}>These apply to every screen in this area — if the area mixes sizes, add it as a second area.</p>

          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Measurements of Area for Screens</label>
              <input value={area.measurements} onChange={(e) => onChange('measurements', e.target.value)} />
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
                  <div className="field">
                    <label>Power Available?</label>
                    <div className="segmented">
                      <button type="button" className={screen.power === 'Yes' ? 'on' : ''} onClick={() => onScreenChange(screen.id, 'power', 'Yes')}>Yes</button>
                      <button type="button" className={screen.power === 'No' ? 'on warn' : ''} onClick={() => onScreenChange(screen.id, 'power', 'No')}>No</button>
                    </div>
                  </div>
                  <div className="field">
                    <label>Data Port / 4G Available?</label>
                    <div className="segmented">
                      <button type="button" className={screen.dataPort === 'Yes' ? 'on' : ''} onClick={() => onScreenChange(screen.id, 'dataPort', 'Yes')}>Yes</button>
                      <button type="button" className={screen.dataPort === 'No' ? 'on warn' : ''} onClick={() => onScreenChange(screen.id, 'dataPort', 'No')}>No</button>
                    </div>
                  </div>
                </div>
                <div className="field-row" style={{ marginBottom: 0 }}>
                  <div className="field" style={{ flex: '1 1 100%' }}>
                    <label>Notes (wall details, additional support needed, etc.)</label>
                    <textarea value={screen.notes} onChange={(e) => onScreenChange(screen.id, 'notes', e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="btn-add" onClick={onAddScreen}>+ Add Screen to This Area</button>
          </div>

          <div className="field-row" style={{ marginTop: 14 }}>
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Additional Photos (power, network, etc.)</label>
              <input type="file" accept="image/*" multiple onChange={(e) => { onAdditionalPhotosAdd(e.target.files); e.target.value = ''; }} />
              {area.additionalPhotos.length > 0 && (
                <div className="additional-photos-grid">
                  {area.additionalPhotos.map((p) => (
                    <div className="additional-photo-thumb" key={p.key}>
                      <img src={p.preview} alt="Additional" />
                      <button type="button" onClick={() => onAdditionalPhotoRemove(p.key)}>&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <BlueprintDiagram
          wmm={area.sizeKey === 'other' ? (Number(area.customW) || null) : SCREEN_SIZES[area.sizeKey]?.wmm}
          hmm={area.sizeKey === 'other' ? (Number(area.customH) || null) : SCREEN_SIZES[area.sizeKey]?.hmm}
          orientation={area.orientation}
        />
      </div>
    </div>
  );
}
