'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { AttachmentPicker } from './AttachmentPicker';
import { uploadAttachments, newAttachmentItems, attachmentsFromExisting } from '../lib/uploadAttachments';
import { logProjectActivity } from '../lib/logProjectActivity';
import { PROJECT_STATUSES, PROJECT_PRIORITIES, statusLabel } from '../lib/projectStatus';

// One form for both create and edit. The other record types have separate New
// and Edit components that have already drifted apart in small ways; there's no
// reason to repeat that here when the fields are identical.
export function ProjectForm({ project, clients, owners, actorName, userId }) {
  const supabase = createClient();
  const router = useRouter();
  const editing = Boolean(project);

  const [form, setForm] = useState({
    title: project?.title || '',
    reference: project?.reference || '',
    clientId: project?.client_id || '',
    siteLocation: project?.site_location || '',
    address: project?.address || '',
    description: project?.description || '',
    requestedBy: project?.requested_by || '',
    requesterEmail: project?.requester_email || '',
    status: project?.status || 'new',
    priority: project?.priority || 'normal',
    dueDate: project?.due_date || '',
    // A new project defaults to whoever is creating it — the common case, and
    // it stops projects being raised with nobody answerable for them.
    ownerId: project ? (project.owner_id || '') : userId,
  });
  const [attachments, setAttachments] = useState(() => attachmentsFromExisting(project?.attachments));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const originalPaths = (project?.attachments || []).map((a) => a.path).filter(Boolean);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.title || !form.clientId) {
      setError('Please give the project a title and pick a client.');
      return;
    }
    setSubmitting(true);
    try {
      const savedAttachments = await uploadAttachments(supabase, attachments);
      const payload = {
        title: form.title,
        reference: form.reference || null,
        client_id: form.clientId,
        site_location: form.siteLocation || null,
        address: form.address || null,
        description: form.description || null,
        requested_by: form.requestedBy || null,
        requester_email: form.requesterEmail || null,
        status: form.status,
        priority: form.priority,
        due_date: form.dueDate || null,
        owner_id: form.ownerId || null,
        attachments: savedAttachments,
      };

      function ownerName(id) {
        if (!id) return 'Unassigned';
        const o = owners.find((x) => x.id === id);
        return o ? (o.full_name || o.email) : 'Someone else';
      }

      if (editing) {
        const historyEntry = { name: actorName, edited_at: new Date().toISOString() };
        const { error: updateErr } = await supabase
          .from('projects')
          .update({ ...payload, edit_history: [...(project.edit_history || []), historyEntry] })
          .eq('id', project.id);
        if (updateErr) throw updateErr;

        // A status change is the thing people actually scan the activity feed
        // for, so it gets its own line rather than a generic "edited".
        if (project.status !== form.status) {
          await logProjectActivity(supabase, {
            projectId: project.id,
            actorName,
            action: 'Status changed',
            detail: `${statusLabel(project.status)} → ${statusLabel(form.status)}`,
          });
        } else {
          await logProjectActivity(supabase, { projectId: project.id, actorName, action: 'Project details edited' });
        }

        // Handing a project over is worth its own line too — it's the other
        // change people scan the feed for.
        if ((project.owner_id || '') !== (form.ownerId || '')) {
          await logProjectActivity(supabase, {
            projectId: project.id,
            actorName,
            action: 'Owner changed',
            detail: `${ownerName(project.owner_id)} → ${ownerName(form.ownerId)}`,
          });
        }

        const surviving = new Set(savedAttachments.map((a) => a.path));
        const orphaned = originalPaths.filter((p) => !surviving.has(p));
        if (orphaned.length) {
          supabase.storage.from('survey-photos').remove(orphaned).catch(() => {});
        }

        router.push(`/projects/${project.id}`);
        router.refresh();
      } else {
        const { data, error: insertErr } = await supabase
          .from('projects')
          .insert({ ...payload, source: 'manual', created_by: userId })
          .select('id')
          .single();
        if (insertErr) throw insertErr;

        await logProjectActivity(supabase, {
          projectId: data.id,
          actorName,
          action: 'Project created',
          detail: `Created manually · owner ${ownerName(form.ownerId)}`,
        });
        router.push(`/projects/${data.id}`);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      setError('Something went wrong saving this project. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="panel">
        <h2>Project Details</h2>
        <div className="field-row">
          <div className="field" style={{ flex: 3, minWidth: 260 }}>
            <label className="req">Title</label>
            <input value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="e.g. Compass — 12 site screen rollout" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Reference</label>
            <input value={form.reference} onChange={(e) => setField('reference', e.target.value)} placeholder="Your job number" />
          </div>
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label className="req">Client</label>
            <select value={form.clientId} onChange={(e) => setField('clientId', e.target.value)}>
              <option value="">Please select</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 2, minWidth: 220 }}>
            <label>Site Name</label>
            <input value={form.siteLocation} onChange={(e) => setField('siteLocation', e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: '1 1 100%' }}>
            <label>Address</label>
            <input value={form.address} onChange={(e) => setField('address', e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: '1 1 100%' }}>
            <label>Description</label>
            <textarea value={form.description} onChange={(e) => setField('description', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Ownership &amp; Scheduling</h2>
        <p className="hint">
          The owner is the internal person answerable for this project. Tasks below sit under
          them — they don&apos;t get owners of their own.
        </p>
        <div className="field-row">
          <div className="field" style={{ flex: '1 1 100%' }}>
            <label>Owner</label>
            <select value={form.ownerId} onChange={(e) => setField('ownerId', e.target.value)}>
              <option value="">Unassigned</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name || o.email}</option>)}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
              {PROJECT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Priority</label>
            <select value={form.priority} onChange={(e) => setField('priority', e.target.value)}>
              {PROJECT_PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Due Date</label>
            <input type="date" min="2000-01-01" max="2100-12-31" value={form.dueDate} onChange={(e) => setField('dueDate', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Requested By</h2>
        <p className="hint">Who asked for this. Filled in automatically when a project comes in through a client request link.</p>
        <div className="field-row">
          <div className="field"><label>Name</label><input value={form.requestedBy} onChange={(e) => setField('requestedBy', e.target.value)} /></div>
          <div className="field"><label>Email</label><input type="email" value={form.requesterEmail} onChange={(e) => setField('requesterEmail', e.target.value)} /></div>
        </div>
      </div>

      <div className="panel">
        <h2>Attachments</h2>
        <p className="hint">Briefs, floor plans, spec sheets, anything the team needs to hand.</p>
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

      {error && <p className="error-text">{error}</p>}
      <div className="actions-row">
        <button className="btn btn-ghost" type="button" onClick={() => router.push(editing ? `/projects/${project.id}` : '/projects')}>Cancel</button>
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Project'}
        </button>
      </div>
    </form>
  );
}
