'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { AttachmentPicker } from './AttachmentPicker';
import { uploadAttachments, newAttachmentItems } from '../lib/uploadAttachments';
import { logProjectActivity } from '../lib/logProjectActivity';
import { PROJECT_STATUSES, PROJECT_PRIORITIES } from '../lib/projectStatus';

// Create only. Editing happens in place on the project page itself — there is
// no Edit screen any more, so nothing here needs an update branch.
export function ProjectForm({ clients, owners, templates, actorName, userId }) {
  const supabase = createClient();
  const router = useRouter();

  const [form, setForm] = useState({
    title: '',
    reference: '',
    clientId: '',
    siteLocation: '',
    address: '',
    description: '',
    requestedBy: '',
    requesterEmail: '',
    status: 'new',
    priority: 'normal',
    dueDate: '',
    // Defaults to whoever is creating it — the common case, and it stops
    // projects being raised with nobody answerable for them.
    ownerId: userId,
    templateId: '',
  });
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Templates scoped to the chosen client, plus the all-client ones.
  const availableTemplates = templates.filter((t) => !t.client_id || t.client_id === form.clientId);

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

      // A chosen template fills in whatever this form was left blank — the
      // same rule the database trigger uses for client requests: anything the
      // person actually typed wins.
      const template = form.templateId ? templates.find((t) => t.id === form.templateId) : null;
      if (template) {
        if (!payload.description) payload.description = template.description || null;
        if (!form.ownerId && template.default_owner_id) payload.owner_id = template.default_owner_id;
        if (template.priority) payload.priority = template.priority;
        // Files are shared by path rather than duplicated in storage, matching
        // the trigger. Removing one from the template later won't break this
        // project — see migration 023.
        payload.attachments = [...savedAttachments, ...(template.attachments || [])];
      }

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
        detail: `Created manually · owner ${ownerName(payload.owner_id)}`,
      });

      // Tasks are copied here rather than by the database trigger — that one
      // only fires for client requests, so a PM choosing a template in this
      // form doesn't end up with the checklist twice.
      if (template) {
        if (template.tasks.length) {
          const rows = template.tasks.map((t, i) => ({
            project_id: data.id,
            title: t.title,
            position: i,
            due_date: t.due_offset_days == null
              ? null
              : new Date(Date.now() + t.due_offset_days * 86400000).toISOString().slice(0, 10),
          }));
          const { error: taskErr } = await supabase.from('project_tasks').insert(rows);
          if (taskErr) console.error(taskErr);
        }
        await logProjectActivity(supabase, {
          projectId: data.id, actorName, action: 'Template applied', detail: template.name,
        });
      }

      router.push(`/projects/${data.id}`);
      router.refresh();
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
            <label>Start From a Template</label>
            <select value={form.templateId} onChange={(e) => setField('templateId', e.target.value)}>
              <option value="">No template — start empty</option>
              {availableTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.tasks.length} task{t.tasks.length === 1 ? '' : 's'})
                </option>
              ))}
            </select>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              Copies a standard checklist onto the project. Pick a client first to see templates
              scoped to them.
            </p>
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
        <button className="btn btn-ghost" type="button" onClick={() => router.push('/projects')}>Cancel</button>
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Project'}
        </button>
      </div>
    </form>
  );
}
