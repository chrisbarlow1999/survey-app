'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { SCREEN_SIZES, MOUNT_TYPES } from '../lib/screenSizes';
import { BlueprintDiagram } from '../components/BlueprintDiagram';
import { PhotoWithOverlay, DEFAULT_OVERLAY } from '../components/PhotoWithOverlay';

function freshLocation() {
  return {
    id: 'loc_' + Math.random().toString(36).slice(2, 9),
    photoFile: null,
    photoPreview: null,
    screenOverlay: null,
    sizeKey: '',
    customW: '',
    customH: '',
    orientation: 'Landscape',
    mountType: '',
    mountTypeOther: '',
    measurements: '',
    power: '',
    dataPort: '',
    notes: '',
    additionalPhotos: [],
  };
}

export default function NewSurveyPage() {
  const supabase = createClient();
  const [form, setForm] = useState({
    engFirst: '', engLast: '', phone: '', date: '', siteLocation: '', address: '', siteContact: '', clientId: '',
    engDays: '', engCount: '', additionalInfo: '',
  });
  const [clients, setClients] = useState([]);
  const [locations, setLocations] = useState([freshLocation()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.from('clients').select('id, name').order('name').then(({ data }) => {
      if (data) setClients(data);
    });
  }, []);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setLocField(id, key, value) {
    setLocations((locs) => locs.map((l) => (l.id === id ? { ...l, [key]: value } : l)));
  }
  function addLocation() {
    setLocations((locs) => [...locs, freshLocation()]);
  }
  function removeLocation(id) {
    setLocations((locs) => locs.filter((l) => l.id !== id));
  }
  function handlePhoto(id, file) {
    if (!file) return;
    setLocField(id, 'photoFile', file);
    setLocField(id, 'photoPreview', URL.createObjectURL(file));
    setLocField(id, 'screenOverlay', DEFAULT_OVERLAY);
  }
  function handleAdditionalPhotos(id, files) {
    if (!files || !files.length) return;
    const added = Array.from(files).map((file) => ({
      key: 'ap_' + Math.random().toString(36).slice(2, 9),
      file,
      preview: URL.createObjectURL(file),
    }));
    setLocations((locs) => locs.map((l) => (l.id === id ? { ...l, additionalPhotos: [...l.additionalPhotos, ...added] } : l)));
  }
  function removeAdditionalPhoto(id, key) {
    setLocations((locs) => locs.map((l) => (l.id === id ? { ...l, additionalPhotos: l.additionalPhotos.filter((p) => p.key !== key) } : l)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.engFirst || !form.engLast || !form.phone || !form.date || !form.siteLocation || !form.clientId) {
      setError('Please complete engineer details, phone, date, site name and client.');
      return;
    }
    setSubmitting(true);
    try {
      // Upload any photos first, one per location, into the survey-photos bucket.
      const uploadedLocations = [];
      for (const loc of locations) {
        let photoPath = null;
        if (loc.photoFile) {
          const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${loc.photoFile.name}`;
          const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, loc.photoFile);
          if (upErr) throw upErr;
          photoPath = path;
        }
        const additionalPhotoPaths = [];
        for (const ap of loc.additionalPhotos) {
          const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${ap.file.name}`;
          const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, ap.file);
          if (upErr) throw upErr;
          additionalPhotoPaths.push(path);
        }
        uploadedLocations.push({
          photo_path: photoPath,
          screen_overlay: loc.photoFile ? loc.screenOverlay : null,
          additional_photos: additionalPhotoPaths,
          screen_size: loc.sizeKey,
          custom_w: loc.sizeKey === 'other' ? loc.customW : null,
          custom_h: loc.sizeKey === 'other' ? loc.customH : null,
          orientation: loc.orientation,
          mount_type: loc.mountType,
          mount_type_other: loc.mountType === 'Other' ? loc.mountTypeOther : null,
          measurements: loc.measurements,
          power: loc.power,
          data_port: loc.dataPort,
          notes: loc.notes,
        });
      }

      const { error: insertErr } = await supabase.from('surveys').insert({
        engineer_first: form.engFirst,
        engineer_last: form.engLast,
        phone: form.phone,
        survey_date: form.date,
        site_location: form.siteLocation,
        client_id: form.clientId,
        address: form.address,
        site_contact: form.siteContact,
        locations: uploadedLocations,
        engineer_days: form.engDays || null,
        engineer_count: form.engCount || null,
        additional_info: form.additionalInfo,
      });
      if (insertErr) throw insertErr;

      setDone(true);
    } catch (err) {
      console.error(err);
      setError('Something went wrong submitting the survey. Please try again.');
    }
    setSubmitting(false);
  }

  if (done) {
    return (
      <main>
        <div className="panel success-panel">
          <h2>Survey submitted</h2>
          <p className="hint">Thanks — this has been sent through to the project team.</p>
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>Submit another survey</button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <form onSubmit={handleSubmit}>
        <div className="panel">
          <h2>Engineer Details</h2>
          <div className="field-row">
            <div className="field"><label className="req">First Name</label><input value={form.engFirst} onChange={(e) => setField('engFirst', e.target.value)} /></div>
            <div className="field"><label className="req">Last Name</label><input value={form.engLast} onChange={(e) => setField('engLast', e.target.value)} /></div>
            <div className="field"><label className="req">Phone Number</label><input type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} /></div>
            <div className="field"><label className="req">Date of Survey</label><input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} /></div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 2, minWidth: 240 }}><label className="req">Site Name</label><input value={form.siteLocation} onChange={(e) => setField('siteLocation', e.target.value)} /></div>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label className="req">Client</label>
              <select value={form.clientId} onChange={(e) => setField('clientId', e.target.value)}>
                <option value="">Please select</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 3, minWidth: 240 }}><label>Address</label><input value={form.address} onChange={(e) => setField('address', e.target.value)} /></div>
            <div className="field" style={{ flex: 2, minWidth: 240 }}><label className="req">Site Contact Info</label><input value={form.siteContact} onChange={(e) => setField('siteContact', e.target.value)} /></div>
          </div>
        </div>

        <div className="panel">
          <h2>Screen Locations</h2>
          <p className="hint">Add one entry per proposed screen.</p>
          {locations.map((loc, i) => (
            <div className="loc-card" key={loc.id}>
              <div className="loc-head">
                <div className="loc-num">Screen Location #{i + 1}</div>
                {i > 0 && <button type="button" className="remove" onClick={() => removeLocation(loc.id)}>Remove</button>}
              </div>
              <div className="loc-body">
              <div>
              <div className="field-row">
                <div className="field" style={{ flex: '1 1 100%' }}>
                  <label>Photo of Area</label>
                  <input type="file" accept="image/*" onChange={(e) => handlePhoto(loc.id, e.target.files[0])} />
                  {loc.photoPreview && (
                    <>
                      <PhotoWithOverlay
                        photoSrc={loc.photoPreview}
                        overlay={loc.screenOverlay}
                        onOverlayChange={(ov) => setLocField(loc.id, 'screenOverlay', ov)}
                      />
                      <div className="overlay-toolbar">
                        {loc.screenOverlay ? (
                          <button type="button" onClick={() => setLocField(loc.id, 'screenOverlay', null)}>Remove screen marker</button>
                        ) : (
                          <button type="button" onClick={() => setLocField(loc.id, 'screenOverlay', DEFAULT_OVERLAY)}>Add screen marker</button>
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
                  <select value={loc.sizeKey} onChange={(e) => setLocField(loc.id, 'sizeKey', e.target.value)}>
                    <option value="">Please select</option>
                    {Object.entries(SCREEN_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Orientation</label>
                  <div className="segmented">
                    <button type="button" className={loc.orientation === 'Landscape' ? 'on' : ''} onClick={() => setLocField(loc.id, 'orientation', 'Landscape')}>Landscape</button>
                    <button type="button" className={loc.orientation === 'Portrait' ? 'on' : ''} onClick={() => setLocField(loc.id, 'orientation', 'Portrait')}>Portrait</button>
                  </div>
                </div>
              </div>
              {loc.sizeKey === 'other' && (
                <div className="field-row">
                  <div className="field"><label>Custom Width (mm)</label><input type="number" value={loc.customW} onChange={(e) => setLocField(loc.id, 'customW', e.target.value)} /></div>
                  <div className="field"><label>Custom Height (mm)</label><input type="number" value={loc.customH} onChange={(e) => setLocField(loc.id, 'customH', e.target.value)} /></div>
                </div>
              )}
              <div className="field-row">
                <div className="field">
                  <label>Mount Type</label>
                  <select value={loc.mountType} onChange={(e) => setLocField(loc.id, 'mountType', e.target.value)}>
                    <option value="">Please select</option>
                    {MOUNT_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                {loc.mountType === 'Other' && (
                  <div className="field">
                    <label>Specify Mount Type</label>
                    <input value={loc.mountTypeOther} onChange={(e) => setLocField(loc.id, 'mountTypeOther', e.target.value)} placeholder="e.g. Freestanding kiosk" />
                  </div>
                )}
              </div>
              <div className="field-row">
                <div className="field" style={{ flex: '1 1 100%' }}>
                  <label>Measurements of Area for Screen</label>
                  <input value={loc.measurements} onChange={(e) => setLocField(loc.id, 'measurements', e.target.value)} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Power Available?</label>
                  <div className="segmented">
                    <button type="button" className={loc.power === 'Yes' ? 'on' : ''} onClick={() => setLocField(loc.id, 'power', 'Yes')}>Yes</button>
                    <button type="button" className={loc.power === 'No' ? 'on warn' : ''} onClick={() => setLocField(loc.id, 'power', 'No')}>No</button>
                  </div>
                </div>
                <div className="field">
                  <label>Data Port / 4G Available?</label>
                  <div className="segmented">
                    <button type="button" className={loc.dataPort === 'Yes' ? 'on' : ''} onClick={() => setLocField(loc.id, 'dataPort', 'Yes')}>Yes</button>
                    <button type="button" className={loc.dataPort === 'No' ? 'on warn' : ''} onClick={() => setLocField(loc.id, 'dataPort', 'No')}>No</button>
                  </div>
                </div>
              </div>
              <div className="field-row">
                <div className="field" style={{ flex: '1 1 100%' }}>
                  <label>Notes (wall details, additional support needed, etc.)</label>
                  <textarea value={loc.notes} onChange={(e) => setLocField(loc.id, 'notes', e.target.value)} />
                </div>
              </div>
              <div className="field-row">
                <div className="field" style={{ flex: '1 1 100%' }}>
                  <label>Additional Photos (power, network, etc.)</label>
                  <input type="file" accept="image/*" multiple onChange={(e) => { handleAdditionalPhotos(loc.id, e.target.files); e.target.value = ''; }} />
                  {loc.additionalPhotos.length > 0 && (
                    <div className="additional-photos-grid">
                      {loc.additionalPhotos.map((p) => (
                        <div className="additional-photo-thumb" key={p.key}>
                          <img src={p.preview} alt="Additional" />
                          <button type="button" onClick={() => removeAdditionalPhoto(loc.id, p.key)}>&times;</button>
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
          ))}
          <button type="button" className="btn-add" onClick={addLocation}>+ Add Screen Location</button>
        </div>

        <div className="panel">
          <h2>Install Resource Estimate</h2>
          <div className="field-row">
            <div className="field"><label>Engineer Days (est.)</label><input type="number" min="0" value={form.engDays} onChange={(e) => setField('engDays', e.target.value)} /></div>
            <div className="field"><label>Engineers Required</label><input type="number" min="0" value={form.engCount} onChange={(e) => setField('engCount', e.target.value)} /></div>
          </div>
        </div>

        <div className="panel">
          <h2>Additional Information</h2>
          <textarea value={form.additionalInfo} onChange={(e) => setField('additionalInfo', e.target.value)} />
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="actions-row">
          <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Survey'}</button>
        </div>
      </form>
    </main>
  );
}
