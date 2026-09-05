'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { InstallAreaCard } from './InstallAreaCard';
import { SignaturePad } from './SignaturePad';
import { AttachmentPicker } from './AttachmentPicker';
import { uploadAttachments, newAttachmentItems, attachmentsFromExisting } from '../lib/uploadAttachments';
import {
  freshInstallArea, addScreenToInstallArea, removeScreenFromInstallArea,
  installAreaFromExisting, installAreaToStored, installPhotoPaths,
} from '../lib/installArea';

export function EditInstallationForm({ installation, areasWithUrls, clients, editorName, signatureUrl }) {
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
    signedBy: installation.signed_by || '',
  });
  const [areas, setAreas] = useState(() => areasWithUrls.map((a) => installAreaFromExisting(a, a.photoUrls)));
  const [signatureBlob, setSignatureBlob] = useState(null);
  const [attachments, setAttachments] = useState(() => attachmentsFromExisting(installation.attachments));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const originalPaths = [
    ...installPhotoPaths(installation.locations),
    ...(installation.attachments || []).map((a) => a.path),
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
  function handleScreenPhoto(id, screenId, file) {
    if (!file) return;
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
          let photoPath = screen.photoPath || null;
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

      let signaturePath = installation.signature_path || null;
      if (signatureBlob) {
        const path = `signatures/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
        const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, signatureBlob, { contentType: 'image/png' });
        if (upErr) throw upErr;
        const oldSignaturePath = installation.signature_path;
        signaturePath = path;
        if (oldSignaturePath) {
          supabase.storage.from('survey-photos').remove([oldSignaturePath]).catch(() => {});
        }
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
        locations: uploadedAreas,
        additional_info: form.additionalInfo,
        attachments: savedAttachments,
        signature_path: signaturePath,
        signed_by: form.signedBy || null,
        edit_history: [...(installation.edit_history || []), newHistoryEntry],
      }).eq('id', installation.id);
      if (updateErr) throw updateErr;

      const survivingPaths = new Set([
        ...installPhotoPaths(uploadedAreas),
        ...savedAttachments.map((a) => a.path),
      ]);
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
          <div className="field"><label className="req">Install Date</label><input type="date" min="2000-01-01" max="2100-12-31" value={form.date} onChange={(e) => setField('date', e.target.value)} /></div>
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
        <div className="field-row">
          <div className="field" style={{ flex: '1 1 100%' }}>
            <label>Signed By (name)</label>
            <input value={form.signedBy} onChange={(e) => setField('signedBy', e.target.value)} />
          </div>
        </div>
        <SignaturePad onChange={setSignatureBlob} existingUrl={signatureUrl} />
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
        <button className="btn btn-ghost" type="button" onClick={() => router.push(`/installations/${installation.id}`)}>Cancel</button>
        <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </form>
  );
}
