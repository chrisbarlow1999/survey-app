'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { VisitIssueCard } from './VisitIssueCard';
import { SignaturePad } from './SignaturePad';
import { AttachmentPicker } from './AttachmentPicker';
import { uploadAttachments, newAttachmentItems, attachmentsFromExisting } from '../lib/uploadAttachments';

function issueFromExisting(issue) {
  return {
    id: 'issue_' + Math.random().toString(36).slice(2, 9),
    title: issue.title || '',
    problemFile: null,
    problemPreview: issue.problemUrl || null,
    problemPath: issue.problem_photo_path || null,
    fix: issue.fix || '',
    workingFile: null,
    workingPreview: issue.workingUrl || null,
    workingPath: issue.working_photo_path || null,
    resolved: issue.resolved || '',
  };
}

function freshIssue() {
  return {
    id: 'issue_' + Math.random().toString(36).slice(2, 9),
    title: '',
    problemFile: null,
    problemPreview: null,
    problemPath: null,
    fix: '',
    workingFile: null,
    workingPreview: null,
    workingPath: null,
    resolved: '',
  };
}

export function EditVisitForm({ visit, issuesWithUrls, clients, editorName, signatureUrl }) {
  const supabase = createClient();
  const router = useRouter();

  const [form, setForm] = useState({
    engFirst: visit.engineer_first || '',
    engLast: visit.engineer_last || '',
    phone: visit.phone || '',
    date: visit.visit_date || '',
    siteLocation: visit.site_location || '',
    address: visit.address || '',
    siteContact: visit.site_contact || '',
    clientId: visit.client_id || '',
    additionalInfo: visit.additional_info || '',
  });
  const [issues, setIssues] = useState(() => issuesWithUrls.map(issueFromExisting));
  const [signatureBlob, setSignatureBlob] = useState(null);
  const [attachments, setAttachments] = useState(() => attachmentsFromExisting(visit.attachments));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // The signature is handled separately (replaced only when a new one is drawn),
  // so it's deliberately not part of the orphan sweep.
  const originalPaths = [
    ...(visit.issues || []).flatMap((i) => [i.problem_photo_path, i.working_photo_path]),
    ...(visit.attachments || []).map((a) => a.path),
  ].filter(Boolean);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setIssueField(id, key, value) {
    setIssues((list) => list.map((x) => (x.id === id ? { ...x, [key]: value } : x)));
  }
  function addIssue() {
    setIssues((list) => [...list, freshIssue()]);
  }
  function removeIssue(id) {
    setIssues((list) => list.filter((x) => x.id !== id));
  }
  function handlePhoto(id, which, file) {
    if (!file) return;
    const fileKey = which === 'problem' ? 'problemFile' : 'workingFile';
    const previewKey = which === 'problem' ? 'problemPreview' : 'workingPreview';
    setIssues((list) => list.map((x) => (
      x.id === id ? { ...x, [fileKey]: file, [previewKey]: URL.createObjectURL(file) } : x
    )));
  }

  async function uploadPhoto(file) {
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, file);
    if (upErr) throw upErr;
    return path;
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
      const savedIssues = [];
      for (const issue of issues) {
        let problemPath = issue.problemPath || null;
        if (issue.problemFile) problemPath = await uploadPhoto(issue.problemFile);
        let workingPath = issue.workingPath || null;
        if (issue.workingFile) workingPath = await uploadPhoto(issue.workingFile);
        savedIssues.push({
          title: issue.title,
          problem_photo_path: problemPath,
          fix: issue.fix,
          working_photo_path: workingPath,
          resolved: issue.resolved,
        });
      }

      const savedAttachments = await uploadAttachments(supabase, attachments);

      let signaturePath = visit.signature_path || null;
      if (signatureBlob) {
        const path = `signatures/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
        const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, signatureBlob, { contentType: 'image/png' });
        if (upErr) throw upErr;
        const oldSignaturePath = visit.signature_path;
        signaturePath = path;
        if (oldSignaturePath) {
          supabase.storage.from('survey-photos').remove([oldSignaturePath]).catch(() => {});
        }
      }

      const newHistoryEntry = { name: editorName, edited_at: new Date().toISOString() };
      const { error: updateErr } = await supabase.from('visits').update({
        engineer_first: form.engFirst,
        engineer_last: form.engLast,
        phone: form.phone,
        visit_date: form.date,
        site_location: form.siteLocation,
        client_id: form.clientId,
        address: form.address,
        site_contact: form.siteContact,
        issues: savedIssues,
        additional_info: form.additionalInfo,
        attachments: savedAttachments,
        signature_path: signaturePath,
        edit_history: [...(visit.edit_history || []), newHistoryEntry],
      }).eq('id', visit.id);
      if (updateErr) throw updateErr;

      // Best-effort cleanup of anything no longer referenced. Requires super
      // admin (storage delete policy) — silently skipped otherwise, the save
      // above has already succeeded either way.
      const survivingPaths = new Set([
        ...savedIssues.flatMap((i) => [i.problem_photo_path, i.working_photo_path]),
        ...savedAttachments.map((a) => a.path),
      ].filter(Boolean));
      const orphaned = originalPaths.filter((p) => !survivingPaths.has(p));
      if (orphaned.length) {
        supabase.storage.from('survey-photos').remove(orphaned).catch(() => {});
      }

      router.push(`/visits/${visit.id}`);
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
          <div className="field"><label className="req">Visit Date</label><input type="date" min="2000-01-01" max="2100-12-31" value={form.date} onChange={(e) => setField('date', e.target.value)} /></div>
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
        <h2>Issues</h2>
        {issues.map((issue, i) => (
          <VisitIssueCard
            key={issue.id}
            issue={issue}
            index={i}
            showRemove={i > 0}
            onRemove={() => removeIssue(issue.id)}
            onChange={(key, value) => setIssueField(issue.id, key, value)}
            onPhotoChange={(which, file) => handlePhoto(issue.id, which, file)}
          />
        ))}
        <button type="button" className="btn-add" onClick={addIssue}>+ Add Issue</button>
      </div>

      <div className="panel">
        <h2>Engineer Sign-Off</h2>
        <SignaturePad onChange={setSignatureBlob} existingUrl={signatureUrl} />
      </div>

      <div className="panel">
        <h2>Attachments</h2>
        <p className="hint">Parts lists, reports, or any other supporting files.</p>
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
        <button className="btn btn-ghost" type="button" onClick={() => router.push(`/visits/${visit.id}`)}>Cancel</button>
        <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </form>
  );
}
