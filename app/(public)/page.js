'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';
import { AreaCard } from '../../components/AreaCard';
import {
  freshArea, addScreenToArea, removeScreenFromArea, ensureOverlaysForScreens, areaToStored,
} from '../../lib/surveyArea';

export default function NewSurveyPage() {
  const supabase = createClient();
  const [form, setForm] = useState({
    engFirst: '', engLast: '', phone: '', date: '', siteLocation: '', address: '', siteContact: '', clientId: '',
    engDays: '', engCount: '', additionalInfo: '',
  });
  const [clients, setClients] = useState([]);
  const [areas, setAreas] = useState([freshArea()]);
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
  function updateArea(id, fn) {
    setAreas((list) => list.map((a) => (a.id === id ? fn(a) : a)));
  }
  function setAreaField(id, key, value) {
    updateArea(id, (a) => ({ ...a, [key]: value }));
  }
  function addArea() {
    setAreas((list) => [...list, freshArea()]);
  }
  function removeArea(id) {
    setAreas((list) => list.filter((a) => a.id !== id));
  }
  function handlePhoto(id, file) {
    if (!file) return;
    // Screens may already exist before a photo is added, so make sure each one
    // has a marker to drag once there's an image to drag it onto.
    updateArea(id, (a) => ensureOverlaysForScreens({
      ...a, photoFile: file, photoPreview: URL.createObjectURL(file),
    }));
  }
  function addScreen(id) {
    updateArea(id, addScreenToArea);
  }
  function removeScreen(id, screenId) {
    updateArea(id, (a) => removeScreenFromArea(a, screenId));
  }
  function setScreenField(id, screenId, key, value) {
    updateArea(id, (a) => ({
      ...a,
      screens: a.screens.map((s) => (s.id === screenId ? { ...s, [key]: value } : s)),
    }));
  }
  function handleAdditionalPhotos(id, files) {
    if (!files || !files.length) return;
    const added = Array.from(files).map((file) => ({
      key: 'ap_' + Math.random().toString(36).slice(2, 9),
      file,
      preview: URL.createObjectURL(file),
    }));
    updateArea(id, (a) => ({ ...a, additionalPhotos: [...a.additionalPhotos, ...added] }));
  }
  function removeAdditionalPhoto(id, key) {
    updateArea(id, (a) => ({ ...a, additionalPhotos: a.additionalPhotos.filter((p) => p.key !== key) }));
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
      // Upload any photos first, one per area, into the survey-photos bucket.
      const uploadedAreas = [];
      for (const area of areas) {
        let photoPath = null;
        if (area.photoFile) {
          const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${area.photoFile.name}`;
          const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, area.photoFile);
          if (upErr) throw upErr;
          photoPath = path;
        }
        const additionalPhotoPaths = [];
        for (const ap of area.additionalPhotos) {
          const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${ap.file.name}`;
          const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, ap.file);
          if (upErr) throw upErr;
          additionalPhotoPaths.push(path);
        }
        uploadedAreas.push(areaToStored(area, photoPath, additionalPhotoPaths));
      }

      // Generated client-side so we know the id even though anonymous submitters
      // can't read surveys back (RLS is insert-only for them) — needed to fire
      // the notification call below.
      const surveyId = crypto.randomUUID();
      const { error: insertErr } = await supabase.from('surveys').insert({
        id: surveyId,
        engineer_first: form.engFirst,
        engineer_last: form.engLast,
        phone: form.phone,
        survey_date: form.date,
        site_location: form.siteLocation,
        client_id: form.clientId,
        address: form.address,
        site_contact: form.siteContact,
        locations: uploadedAreas,
        engineer_days: form.engDays || null,
        engineer_count: form.engCount || null,
        additional_info: form.additionalInfo,
      });
      if (insertErr) throw insertErr;

      fetch('/api/notify-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyId }),
      }).catch(() => {}); // best-effort — never block the submission on this

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
            <div className="field"><label className="req">Date of Survey</label><input type="date" min="2000-01-01" max="2100-12-31" value={form.date} onChange={(e) => setField('date', e.target.value)} /></div>
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
          <h2>Screen Areas</h2>
          <p className="hint">One entry per area, with all the screens going in that area.</p>
          {areas.map((area, i) => (
            <AreaCard
              key={area.id}
              area={area}
              index={i}
              showRemove={i > 0}
              onRemove={() => removeArea(area.id)}
              onChange={(key, value) => setAreaField(area.id, key, value)}
              onPhotoChange={(file) => handlePhoto(area.id, file)}
              onAdditionalPhotosAdd={(files) => handleAdditionalPhotos(area.id, files)}
              onAdditionalPhotoRemove={(key) => removeAdditionalPhoto(area.id, key)}
              onAddScreen={() => addScreen(area.id)}
              onRemoveScreen={(screenId) => removeScreen(area.id, screenId)}
              onScreenChange={(screenId, key, value) => setScreenField(area.id, screenId, key, value)}
            />
          ))}
          <button type="button" className="btn-add" onClick={addArea}>+ Add Area</button>
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
