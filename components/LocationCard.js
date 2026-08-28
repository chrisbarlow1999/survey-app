'use client';

import { SCREEN_SIZES, MOUNT_TYPES } from '../lib/screenSizes';
import { BlueprintDiagram } from './BlueprintDiagram';
import { PhotoWithOverlay, DEFAULT_OVERLAY } from './PhotoWithOverlay';

export function LocationCard({ loc, index, showRemove, onRemove, onChange, onPhotoChange, onAdditionalPhotosAdd, onAdditionalPhotoRemove }) {
  return (
    <div className="loc-card">
      <div className="loc-head">
        <div className="loc-num">Screen Location #{index + 1}</div>
        {showRemove && <button type="button" className="remove" onClick={onRemove}>Remove</button>}
      </div>
      <div className="loc-body">
        <div>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Photo of Area</label>
              <input type="file" accept="image/*" onChange={(e) => { onPhotoChange(e.target.files[0]); e.target.value = ''; }} />
              {loc.photoPreview && (
                <>
                  <PhotoWithOverlay
                    photoSrc={loc.photoPreview}
                    overlay={loc.screenOverlay}
                    onOverlayChange={(ov) => onChange('screenOverlay', ov)}
                  />
                  <div className="overlay-toolbar">
                    {loc.screenOverlay ? (
                      <button type="button" onClick={() => onChange('screenOverlay', null)}>Remove screen marker</button>
                    ) : (
                      <button type="button" onClick={() => onChange('screenOverlay', DEFAULT_OVERLAY)}>Add screen marker</button>
                    )}
                  </div>
                  <p className="hint" style={{ margin: '6px 0 0' }}>Drag the amber box onto the photo to mark where the screen will go. Drag the corner handle to resize it.</p>
                </>
              )}
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Screen Size</label>
              <select value={loc.sizeKey} onChange={(e) => onChange('sizeKey', e.target.value)}>
                <option value="">Please select</option>
                {Object.entries(SCREEN_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Orientation</label>
              <div className="segmented">
                <button type="button" className={loc.orientation === 'Landscape' ? 'on' : ''} onClick={() => onChange('orientation', 'Landscape')}>Landscape</button>
                <button type="button" className={loc.orientation === 'Portrait' ? 'on' : ''} onClick={() => onChange('orientation', 'Portrait')}>Portrait</button>
              </div>
            </div>
          </div>
          {loc.sizeKey === 'other' && (
            <div className="field-row">
              <div className="field"><label>Custom Width (mm)</label><input type="number" value={loc.customW} onChange={(e) => onChange('customW', e.target.value)} /></div>
              <div className="field"><label>Custom Height (mm)</label><input type="number" value={loc.customH} onChange={(e) => onChange('customH', e.target.value)} /></div>
            </div>
          )}
          <div className="field-row">
            <div className="field">
              <label>Mount Type</label>
              <select value={loc.mountType} onChange={(e) => onChange('mountType', e.target.value)}>
                <option value="">Please select</option>
                {MOUNT_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {loc.mountType === 'Other' && (
              <div className="field">
                <label>Specify Mount Type</label>
                <input value={loc.mountTypeOther} onChange={(e) => onChange('mountTypeOther', e.target.value)} placeholder="e.g. Freestanding kiosk" />
              </div>
            )}
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Measurements of Area for Screen</label>
              <input value={loc.measurements} onChange={(e) => onChange('measurements', e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Power Available?</label>
              <div className="segmented">
                <button type="button" className={loc.power === 'Yes' ? 'on' : ''} onClick={() => onChange('power', 'Yes')}>Yes</button>
                <button type="button" className={loc.power === 'No' ? 'on warn' : ''} onClick={() => onChange('power', 'No')}>No</button>
              </div>
            </div>
            <div className="field">
              <label>Data Port / 4G Available?</label>
              <div className="segmented">
                <button type="button" className={loc.dataPort === 'Yes' ? 'on' : ''} onClick={() => onChange('dataPort', 'Yes')}>Yes</button>
                <button type="button" className={loc.dataPort === 'No' ? 'on warn' : ''} onClick={() => onChange('dataPort', 'No')}>No</button>
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Notes (wall details, additional support needed, etc.)</label>
              <textarea value={loc.notes} onChange={(e) => onChange('notes', e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Additional Photos (power, network, etc.)</label>
              <input type="file" accept="image/*" multiple onChange={(e) => { onAdditionalPhotosAdd(e.target.files); e.target.value = ''; }} />
              {loc.additionalPhotos.length > 0 && (
                <div className="additional-photos-grid">
                  {loc.additionalPhotos.map((p) => (
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
          wmm={loc.sizeKey === 'other' ? (Number(loc.customW) || null) : SCREEN_SIZES[loc.sizeKey]?.wmm}
          hmm={loc.sizeKey === 'other' ? (Number(loc.customH) || null) : SCREEN_SIZES[loc.sizeKey]?.hmm}
          orientation={loc.orientation}
        />
      </div>
    </div>
  );
}
