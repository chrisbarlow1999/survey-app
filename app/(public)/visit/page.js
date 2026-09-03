'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';
import { VisitIssueCard } from '../../../components/VisitIssueCard';
import { SignaturePad } from '../../../components/SignaturePad';
import { AttachmentPicker } from '../../../components/AttachmentPicker';
import { uploadAttachments, newAttachmentItems } from '../../../lib/uploadAttachments';

function freshIssue() {
  return {
    id: 'issue_' + Math.random().toString(36).slice(2, 9),
    title: '',
    problemFile: null,
    problemPreview: null,
    fix: '',
    workingFile: null,
    workingPreview: null,
    resolved: '',
  };
}

export default function NewVisitPage() {
  const supabase = createClient();
  const [form, setForm] = useState({
    engFirst: '', engLast: '', phone: '', date: '', siteLocation: '', address: '', siteContact: '', clientId: '',
    additionalInfo: '',
  });
  const [clients, setClients] = useState([]);
  const [issues, setIssues] = useState([freshIssue()]);
  const [signatureBlob, setSignatureBlob] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
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
    if (!signatureBlob) {
      setError('Please sign in the box above to confirm the visit before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      // Two photos per issue, uploaded one at a time — a multi-issue visit on
      // site signal can be a lot of uploads, so show progress rather than a
      // silent spinner.
      const photoCount = issues.reduce((n, i) => n + (i.problemFile ? 1 : 0) + (i.workingFile ? 1 : 0), 0);
      let uploaded = 0;
      const nextProgress = () => {
        uploaded += 1;
        setProgress(`Uploading photo ${uploaded} of ${photoCount}…`);
      };

      const savedIssues = [];
      for (const issue of issues) {
        let problemPath = null;
        if (issue.problemFile) {
          nextProgress();
          problemPath = await uploadPhoto(issue.problemFile);
        }
        let workingPath = null;
        if (issue.workingFile) {
          nextProgress();
          workingPath = await uploadPhoto(issue.workingFile);
        }
        savedIssues.push({
          title: issue.title,
          problem_photo_path: problemPath,
          fix: issue.fix,
          working_photo_path: workingPath,
          resolved: issue.resolved,
        });
      }

      setProgress('Uploading attachments…');
      const savedAttachments = await uploadAttachments(supabase, attachments);

      setProgress('Saving…');
      const signaturePath = `signatures/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
      const { error: sigErr } = await supabase.storage
        .from('survey-photos')
        .upload(signaturePath, signatureBlob, { contentType: 'image/png' });
      if (sigErr) throw sigErr;

      const { error: insertErr } = await supabase.from('visits').insert({
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
      });
      if (insertErr) throw insertErr;

      setDone(true);
    } catch (err) {
      console.error(err);
      setError('Something went wrong submitting the visit. Please try again.');
    }
    setProgress('');
    setSubmitting(false);
  }

  if (done) {
    return (
      <main>
        <div className="panel success-panel">
          <h2>Engineer visit submitted</h2>
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
          <p className="hint">Add one entry per fault — a photo of the problem, what you did, and a photo of the screen working.</p>
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
          <p className="hint">Sign below to confirm the work above was carried out.</p>
          <SignaturePad onChange={setSignatureBlob} />
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
        {submitting && progress && <p className="hint">{progress}</p>}
        <div className="actions-row">
          <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Visit'}</button>
        </div>
      </form>
    </main>
  );
}
