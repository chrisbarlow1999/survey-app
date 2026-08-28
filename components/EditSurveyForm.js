'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { LocationCard } from './LocationCard';
import { DEFAULT_OVERLAY } from './PhotoWithOverlay';

function locationFromExisting(loc) {
  return {
    id: 'loc_' + Math.random().toString(36).slice(2, 9),
    photoFile: null,
    photoPreview: loc.photoUrl || null,
    photoPath: loc.photo_path || null,
    screenOverlay: loc.screen_overlay || null,
    sizeKey: loc.screen_size || '',
    customW: loc.custom_w != null ? String(loc.custom_w) : '',
    customH: loc.custom_h != null ? String(loc.custom_h) : '',
    orientation: loc.orientation || 'Landscape',
    mountType: loc.mount_type || '',
    mountTypeOther: loc.mount_type_other || '',
    measurements: loc.measurements || '',
    power: loc.power || '',
    dataPort: loc.data_port || '',
    notes: loc.notes || '',
    additionalPhotos: (loc.additionalPhotoUrls || []).map((url, idx) => ({
      key: 'existing_' + idx,
      file: null,
      preview: url,
      existingPath: (loc.additional_photos || [])[idx] || null,
    })),
  };
}

function freshLocation() {
  return {
    id: 'loc_' + Math.random().toString(36).slice(2, 9),
    photoFile: null,
    photoPreview: null,
    photoPath: null,
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

export function EditSurveyForm({ survey, locationsWithUrls, clients }) {
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
  const [locations, setLocations] = useState(() => locationsWithUrls.map(locationFromExisting));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const originalPaths = (survey.locations || [])
    .flatMap((l) => [l.photo_path, ...(l.additional_photos || [])])
    .filter(Boolean);

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
    setLocations((locs) => locs.map((l) => (l.id === id
      ? { ...l, photoFile: file, photoPreview: URL.createObjectURL(file), screenOverlay: l.screenOverlay || DEFAULT_OVERLAY }
      : l)));
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
      const uploadedLocations = [];
      for (const loc of locations) {
        let photoPath = loc.photoPath || null;
        if (loc.photoFile) {
          const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${loc.photoFile.name}`;
          const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, loc.photoFile);
          if (upErr) throw upErr;
          photoPath = path;
        }
        const additionalPhotoPaths = [];
        for (const ap of loc.additionalPhotos) {
          if (ap.file) {
            const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${ap.file.name}`;
            const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, ap.file);
            if (upErr) throw upErr;
            additionalPhotoPaths.push(path);
          } else if (ap.existingPath) {
            additionalPhotoPaths.push(ap.existingPath);
          }
        }
        uploadedLocations.push({
          photo_path: photoPath,
          screen_overlay: photoPath ? loc.screenOverlay : null,
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

      const { error: updateErr } = await supabase.from('surveys').update({
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
      }).eq('id', survey.id);
      if (updateErr) throw updateErr;

      // Best-effort cleanup of any photo that's no longer referenced after this edit.
      // Requires super admin (see migration 007) — silently skipped otherwise, the
      // save above has already succeeded either way.
      const survivingPaths = new Set();
      uploadedLocations.forEach((l) => {
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
          <LocationCard
            key={loc.id}
            loc={loc}
            index={i}
            showRemove={i > 0}
            onRemove={() => removeLocation(loc.id)}
            onChange={(key, value) => setLocField(loc.id, key, value)}
            onPhotoChange={(file) => handlePhoto(loc.id, file)}
            onAdditionalPhotosAdd={(files) => handleAdditionalPhotos(loc.id, files)}
            onAdditionalPhotoRemove={(key) => removeAdditionalPhoto(loc.id, key)}
          />
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
        <button className="btn btn-ghost" type="button" onClick={() => router.push(`/dashboard/${survey.id}`)}>Cancel</button>
        <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </form>
  );
}
