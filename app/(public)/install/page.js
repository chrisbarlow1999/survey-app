'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';
import { InstallLocationCard } from '../../../components/InstallLocationCard';

function freshLocation() {
  return {
    id: 'loc_' + Math.random().toString(36).slice(2, 9),
    label: '',
    photoFile: null,
    photoPreview: null,
    installed: '',
    notes: '',
  };
}

export default function NewInstallationPage() {
  const supabase = createClient();
  const [form, setForm] = useState({
    engFirst: '', engLast: '', phone: '', date: '', siteLocation: '', address: '', siteContact: '', clientId: '',
    additionalInfo: '',
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
        let photoPath = null;
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

      const installationId = crypto.randomUUID();
      const { error: insertErr } = await supabase.from('installations').insert({
        id: installationId,
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
      });
      if (insertErr) throw insertErr;

      fetch('/api/notify-installation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId }),
      }).catch(() => {});

      setDone(true);
    } catch (err) {
      console.error(err);
      setError('Something went wrong submitting the install confirmation. Please try again.');
    }
    setSubmitting(false);
  }

  if (done) {
    return (
      <main>
        <div className="panel success-panel">
          <h2>Install confirmation submitted</h2>
          <p className="hint">Thanks — this has been sent through to the project team.</p>
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>Submit another</button>
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
          <p className="hint">Add one entry per screen installed, with a proof photo.</p>
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
          <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Confirmation'}</button>
        </div>
      </form>
    </main>
  );
}
