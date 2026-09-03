'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { AreaCard } from './AreaCard';
import { AttachmentPicker } from './AttachmentPicker';
import { uploadAttachments, newAttachmentItems, attachmentsFromExisting } from '../lib/uploadAttachments';
import {
  freshArea, addScreenToArea, removeScreenFromArea, ensureOverlaysForScreens,
  areaFromExisting, areaToStored,
} from '../lib/surveyArea';

export function EditSurveyForm({ survey, locationsWithUrls, clients, editorName }) {
  const supabase = createClient();
  const router = useRouter();

  const [form, setForm] = useState({
    engFirst: survey.engineer_first || '',
    engLast: survey.engineer_last || '',
    phone: survey.phone || '',
    date: survey.survey_date || '',
    siteLocation: survey.site_location || '',
    address: survey.address || '',
    siteContact: survey.site_contact || '',
    clientId: survey.client_id || '',
    engDays: survey.engineer_days != null ? String(survey.engineer_days) : '',
    engCount: survey.engineer_count != null ? String(survey.engineer_count) : '',
    additionalInfo: survey.additional_info || '',
  });
  const [areas, setAreas] = useState(() => locationsWithUrls.map((a) => areaFromExisting(a, a.photoUrl, a.additionalPhotoUrls)));
  const [attachments, setAttachments] = useState(() => attachmentsFromExisting(survey.attachments));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const originalPaths = [
    ...(survey.locations || []).flatMap((l) => [l.photo_path, ...(l.additional_photos || [])]),
    ...(survey.attachments || []).map((a) => a.path),
  ].filter(Boolean);

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
      const uploadedAreas = [];
      for (const area of areas) {
        let photoPath = area.photoPath || null;
        if (area.photoFile) {
          const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${area.photoFile.name}`;
          const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, area.photoFile);
          if (upErr) throw upErr;
          photoPath = path;
        }
        const additionalPhotoPaths = [];
        for (const ap of area.additionalPhotos) {
          if (ap.file) {
            const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${ap.file.name}`;
            const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, ap.file);
            if (upErr) throw upErr;
            additionalPhotoPaths.push(path);
          } else if (ap.existingPath) {
            additionalPhotoPaths.push(ap.existingPath);
          }
        }
        uploadedAreas.push(areaToStored(area, photoPath, additionalPhotoPaths));
      }

      const savedAttachments = await uploadAttachments(supabase, attachments);

      const newHistoryEntry = { name: editorName, edited_at: new Date().toISOString() };
      const { error: updateErr } = await supabase.from('surveys').update({
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
        attachments: savedAttachments,
        edit_history: [...(survey.edit_history || []), newHistoryEntry],
      }).eq('id', survey.id);
      if (updateErr) throw updateErr;

      // Best-effort cleanup of any photo that's no longer referenced after this edit.
      // Requires super admin (see migration 007) — silently skipped otherwise, the
      // save above has already succeeded either way.
      const survivingPaths = new Set();
      savedAttachments.forEach((a) => survivingPaths.add(a.path));
      uploadedAreas.forEach((l) => {
        if (l.photo_path) survivingPaths.add(l.photo_path);
        (l.additional_photos || []).forEach((p) => survivingPaths.add(p));
      });
      const orphaned = originalPaths.filter((p) => !survivingPaths.has(p));
      if (orphaned.length) {
        supabase.storage.from('survey-photos').remove(orphaned).catch(() => {});
      }

      router.push(`/dashboard/${survey.id}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Something went wrong saving your changes. Please try again.');
    }
    setSubmitting(false);
  }

  return (
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
        <h2>Attachments</h2>
        <p className="hint">Floor plans, spec sheets, or any other supporting documents.</p>
        <div className="field-row">
          <AttachmentPicker
            attachments={attachments}
            onAdd={(files) => setAttachments((a) => [...a, ...newAttachmentItems(files)])}
            onRemove={(key) => setAttachments((a) => a.filter((x) => x.key !== key))}
            label="Files"
            hint="PDFs, images, spreadsheets — up to 10MB each."
          />
        </div>
      </div>

      <div className="panel">
        <h2>Additional Information</h2>
        <textarea value={form.additionalInfo} onChange={(e) => setField('additionalInfo', e.target.value)} />
      </div>

      {error && <p className="error-text">{error}</p>}
      <div className="actions-row">
        <button className="btn btn-ghost" type="button" onClick={() => router.push(`/dashboard/${survey.id}`)}>Cancel</button>
        <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </form>
  );
}
