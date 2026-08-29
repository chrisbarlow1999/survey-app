'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { InstallLocationCard } from './InstallLocationCard';

function locationFromExisting(loc) {
  return {
    id: 'loc_' + Math.random().toString(36).slice(2, 9),
    label: loc.label || '',
    photoFile: null,
    photoPreview: loc.photoUrl || null,
    photoPath: loc.photo_path || null,
    installed: loc.installed || '',
    notes: loc.notes || '',
  };
}

function freshLocation() {
  return {
    id: 'loc_' + Math.random().toString(36).slice(2, 9),
    label: '',
    photoFile: null,
    photoPreview: null,
    photoPath: null,
    installed: '',
    notes: '',
  };
}

export function EditInstallationForm({ installation, locationsWithUrls, clients, editorName }) {
  const supabase = createClient();
  const router = useRouter();

  const [form, setForm] = useState({
    engFirst: installation.engineer_first || '',
    engLast: installation.engineer_last || '',
    phone: installation.phone || '',
    date: installation.install_date || '',
    siteLocation: installation.site_location || '',
    address: installation.address || '',
    siteContact: installation.site_contact || '',
    clientId: installation.client_id || '',
    additionalInfo: installation.additional_info || '',
  });
  const [locations, setLocations] = useState(() => locationsWithUrls.map(locationFromExisting));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const originalPaths = (installation.locations || []).map((l) => l.photo_path).filter(Boolean);

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
    setLocations((locs) => locs.map((l) => (l.id === id ? { ...l, photoFile: file, photoPreview: URL.createObjectURL(file) } : l)));
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
        uploadedLocations.push({
          label: loc.label,
          photo_path: photoPath,
          installed: loc.installed,
          notes: loc.notes,
        });
      }

      const newHistoryEntry = { name: editorName, edited_at: new Date().toISOString() };
      const { error: updateErr } = await supabase.from('installations').update({
        engineer_first: form.engFirst,
        engineer_last: form.engLast,
        phone: form.phone,
        install_date: form.date,
        site_location: form.siteLocation,
        client_id: form.clientId,
        address: form.address,
        site_contact: form.siteContact,
        locations: uploadedLocations,
        additional_info: form.additionalInfo,
        edit_history: [...(installation.edit_history || []), newHistoryEntry],
      }).eq('id', installation.id);
      if (updateErr) throw updateErr;

      const survivingPaths = new Set(uploadedLocations.map((l) => l.photo_path).filter(Boolean));
      const orphaned = originalPaths.filter((p) => !survivingPaths.has(p));
      if (orphaned.length) {
        supabase.storage.from('survey-photos').remove(orphaned).catch(() => {});
      }

      router.push(`/installations/${installation.id}`);
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
          <div className="field"><label className="req">Install Date</label><input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} /></div>
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
          <div className="field" style={{ flex: 2, minWidth: 240 }}><label>Site Contact Info</label><input value={form.siteContact} onChange={(e) => setField('siteContact', e.target.value)} /></div>
        </div>
      </div>

      <div className="panel">
        <h2>Installed Screens</h2>
        {locations.map((loc, i) => (
          <InstallLocationCard
            key={loc.id}
            loc={loc}
            index={i}
            showRemove={i > 0}
            onRemove={() => removeLocation(loc.id)}
            onChange={(key, value) => setLocField(loc.id, key, value)}
            onPhotoChange={(file) => handlePhoto(loc.id, file)}
          />
        ))}
        <button type="button" className="btn-add" onClick={addLocation}>+ Add Screen</button>
      </div>

      <div className="panel">
        <h2>Additional Information</h2>
        <textarea value={form.additionalInfo} onChange={(e) => setField('additionalInfo', e.target.value)} />
      </div>

      {error && <p className="error-text">{error}</p>}
      <div className="actions-row">
        <button className="btn btn-ghost" type="button" onClick={() => router.push(`/installations/${installation.id}`)}>Cancel</button>
        <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </form>
  );
}
