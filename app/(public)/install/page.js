'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';
import { InstallAreaCard } from '../../../components/InstallAreaCard';
import { SignaturePad } from '../../../components/SignaturePad';
import { AttachmentPicker } from '../../../components/AttachmentPicker';
import { uploadAttachments, newAttachmentItems } from '../../../lib/uploadAttachments';
import {
  freshInstallArea, addScreenToInstallArea, removeScreenFromInstallArea, installAreaToStored,
  installAreaToDraft, installAreaFromDraft,
} from '../../../lib/installArea';
import { compressImage } from '../../../lib/compressImage';
import { SiteNameField } from '../../../components/SiteNameField';
import { DraftBanner } from '../../../components/DraftBanner';
import { loadDraft, clearDraft, useDraftAutosave } from '../../../lib/formDraft';

const DRAFT_KEY = 'install';

export default function NewInstallationPage() {
  const supabase = createClient();
  const [form, setForm] = useState({
    engFirst: '', engLast: '', phone: '', date: '', siteLocation: '', address: '', siteContact: '', clientId: '',
    additionalInfo: '', signedBy: '',
  });
  const [clients, setClients] = useState([]);
  const [areas, setAreas] = useState([freshInstallArea()]);
  const [signatureBlob, setSignatureBlob] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    supabase.from('clients').select('id, name').order('name').then(({ data }) => {
      if (data) setClients(data);
    });
  }, []);

  useEffect(() => { setDraft(loadDraft(DRAFT_KEY)); }, []);

  useDraftAutosave(
    DRAFT_KEY,
    {
      form,
      areas: areas.map(installAreaToDraft),
      hadPhotos: areas.some((a) => a.screens.some((s) => s.photoFile)),
    },
    !done
  );

  function restoreDraft() {
    setForm(draft.data.form);
    setAreas((draft.data.areas || []).map(installAreaFromDraft));
    setDraft(null);
  }
  function discardDraft() {
    clearDraft(DRAFT_KEY);
    setDraft(null);
  }

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
    setAreas((list) => [...list, freshInstallArea()]);
  }
  function removeArea(id) {
    setAreas((list) => list.filter((a) => a.id !== id));
  }
  function addScreen(id) {
    updateArea(id, addScreenToInstallArea);
  }
  function removeScreen(id, screenId) {
    updateArea(id, (a) => removeScreenFromInstallArea(a, screenId));
  }
  function setScreenField(id, screenId, key, value) {
    updateArea(id, (a) => ({
      ...a,
      screens: a.screens.map((s) => (s.id === screenId ? { ...s, [key]: value } : s)),
    }));
  }
  async function handleScreenPhoto(id, screenId, file) {
    if (!file) return;
    file = await compressImage(file);
    updateArea(id, (a) => ({
      ...a,
      screens: a.screens.map((s) => (s.id === screenId
        ? { ...s, photoFile: file, photoPreview: URL.createObjectURL(file) }
        : s)),
    }));
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
        const screenPhotoPaths = [];
        for (const screen of area.screens) {
          let photoPath = null;
          if (screen.photoFile) {
            const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${screen.photoFile.name}`;
            const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, screen.photoFile);
            if (upErr) throw upErr;
            photoPath = path;
          }
          screenPhotoPaths.push(photoPath);
        }
        uploadedAreas.push(installAreaToStored(area, screenPhotoPaths));
      }

      const savedAttachments = await uploadAttachments(supabase, attachments);

      let signaturePath = null;
      if (signatureBlob) {
        const path = `signatures/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
        const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, signatureBlob, { contentType: 'image/png' });
        if (upErr) throw upErr;
        signaturePath = path;
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
        locations: uploadedAreas,
        additional_info: form.additionalInfo,
        attachments: savedAttachments,
        signature_path: signaturePath,
        signed_by: form.signedBy || null,
      });
      if (insertErr) throw insertErr;

      fetch('/api/notify-installation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId }),
      }).catch(() => {});

      clearDraft(DRAFT_KEY);
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
      {draft && (
        <DraftBanner savedAt={draft.at} hadPhotos={draft.data?.hadPhotos} onRestore={restoreDraft} onDiscard={discardDraft} />
      )}
      <form onSubmit={handleSubmit}>
        <div className="panel">
          <h2>Engineer Details</h2>
          <div className="field-row">
            <div className="field"><label className="req">First Name</label><input value={form.engFirst} onChange={(e) => setField('engFirst', e.target.value)} /></div>
            <div className="field"><label className="req">Last Name</label><input value={form.engLast} onChange={(e) => setField('engLast', e.target.value)} /></div>
            <div className="field"><label className="req">Phone Number</label><input type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} /></div>
            <div className="field"><label className="req">Install Date</label><input type="date" min="2000-01-01" max="2100-12-31" value={form.date} onChange={(e) => setField('date', e.target.value)} /></div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 2, minWidth: 240 }}>
              <SiteNameField
                value={form.siteLocation}
                onChange={(v) => setField("siteLocation", v)}
                clientId={form.clientId}
              />
            </div>
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
          <p className="hint">One entry per area, with a proof photo for each screen you installed in it.</p>
          {areas.map((area, i) => (
            <InstallAreaCard
              key={area.id}
              area={area}
              index={i}
              showRemove={i > 0}
              onRemove={() => removeArea(area.id)}
              onChange={(key, value) => setAreaField(area.id, key, value)}
              onAddScreen={() => addScreen(area.id)}
              onRemoveScreen={(screenId) => removeScreen(area.id, screenId)}
              onScreenChange={(screenId, key, value) => setScreenField(area.id, screenId, key, value)}
              onScreenPhotoChange={(screenId, file) => handleScreenPhoto(area.id, screenId, file)}
            />
          ))}
          <button type="button" className="btn-add" onClick={addArea}>+ Add Area</button>
        </div>

        <div className="panel">
          <h2>Site Sign-Off (optional)</h2>
          <p className="hint">If the site contact is available, they can sign to confirm the install.</p>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Signed By (name)</label>
              <input value={form.signedBy} onChange={(e) => setField('signedBy', e.target.value)} />
            </div>
          </div>
          <SignaturePad onChange={setSignatureBlob} />
        </div>

        <div className="panel">
          <h2>Attachments</h2>
          <p className="hint">Sign-off sheets, spec documents, or any other supporting files.</p>
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
          <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Confirmation'}</button>
        </div>
      </form>
    </main>
  );
}
