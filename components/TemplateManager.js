'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { logAdminAction } from '../lib/logAdminAction';
import { uploadAttachments, newAttachmentItems } from '../lib/uploadAttachments';
import { formatBytes } from '../lib/formatBytes';
import { MAX_ATTACHMENT_BYTES } from './AttachmentPicker';
import { PROJECT_PRIORITIES } from '../lib/projectStatus';

// A template is the starting state of a project: a checklist, plus the
// description, priority, owner and files that should come with it. Everything
// here saves as you change it, the same as the project page — there's no Save
// button and no separate edit screen.
export function TemplateManager({ templates, clients, owners }) {
  const supabase = createClient();
  const router = useRouter();

  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [taskDrafts, setTaskDrafts] = useState({});
  const [offsetDrafts, setOffsetDrafts] = useState({});
  // Local echo of edits so a field doesn't snap back to the server value
  // between the write landing and the router refresh arriving.
  const [edits, setEdits] = useState({});

  function valueOf(template, key) {
    const local = edits[template.id];
    return local && key in local ? local[key] : (template[key] ?? '');
  }

  async function patch(template, key, raw) {
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (value === (template[key] ?? '')) return;
    setEdits((e) => ({ ...e, [template.id]: { ...e[template.id], [key]: value } }));
    const nullable = ['description', 'default_owner_id', 'client_id'];
    const { error: updErr } = await supabase
      .from('project_templates')
      .update({ [key]: nullable.includes(key) ? (value || null) : value })
      .eq('id', template.id);
    if (updErr) {
      console.error(updErr);
      setError(updErr.code === '23505' ? 'Another template already covers that client.' : 'Could not save that change.');
      setEdits((e) => ({ ...e, [template.id]: { ...e[template.id], [key]: template[key] ?? '' } }));
      return;
    }
    setError('');
    router.refresh();
  }

  async function addTemplate(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    const { data, error: insErr } = await supabase
      .from('project_templates')
      .insert({ name, client_id: newClient || null })
      .select('id')
      .single();
    setBusy(false);
    if (insErr) {
      console.error(insErr);
      setError('Could not create that template.');
      return;
    }
    logAdminAction(supabase, 'create_project_template', name);
    setNewName('');
    setNewClient('');
    setOpenId(data.id);
    router.refresh();
  }

  async function removeTemplate(t) {
    if (!confirm(`Delete the "${t.name}" template? Projects already created from it keep their tasks and files.`)) return;
    setBusy(true);
    // Deliberately no storage cleanup here — a template's files are shared by
    // path with every project made from it (see migration 023). Removing them
    // would break attachments on live projects.
    const { error: delErr } = await supabase.from('project_templates').delete().eq('id', t.id);
    setBusy(false);
    if (delErr) {
      console.error(delErr);
      setError('Could not delete that template.');
      return;
    }
    logAdminAction(supabase, 'delete_project_template', t.name);
    router.refresh();
  }

  async function toggleDefault(t) {
    setBusy(true);
    setError('');
    // One default per scope (a partial unique index enforces it), so clear the
    // current holder first rather than letting the write bounce.
    if (!t.is_default) {
      const scope = supabase.from('project_templates').update({ is_default: false }).eq('is_default', true);
      await (t.client_id ? scope.eq('client_id', t.client_id) : scope.is('client_id', null));
    }
    const { error: updErr } = await supabase
      .from('project_templates')
      .update({ is_default: !t.is_default })
      .eq('id', t.id);
    setBusy(false);
    if (updErr) {
      console.error(updErr);
      setError('Could not change the default.');
      return;
    }
    logAdminAction(supabase, t.is_default ? 'unset_default_template' : 'set_default_template', t.name);
    router.refresh();
  }

  async function addTask(template) {
    const title = (taskDrafts[template.id] || '').trim();
    if (!title) return;
    const rawOffset = (offsetDrafts[template.id] || '').trim();
    const offset = rawOffset === '' ? null : Number(rawOffset);
    const position = template.tasks.length
      ? Math.max(...template.tasks.map((x) => x.position || 0)) + 1
      : 0;
    setBusy(true);
    const { error: insErr } = await supabase.from('project_template_tasks').insert({
      template_id: template.id,
      title,
      position,
      due_offset_days: Number.isFinite(offset) ? offset : null,
    });
    setBusy(false);
    if (insErr) {
      console.error(insErr);
      setError('Could not add that task.');
      return;
    }
    setTaskDrafts((d) => ({ ...d, [template.id]: '' }));
    setOffsetDrafts((d) => ({ ...d, [template.id]: '' }));
    router.refresh();
  }

  async function removeTask(task) {
    setBusy(true);
    const { error: delErr } = await supabase.from('project_template_tasks').delete().eq('id', task.id);
    setBusy(false);
    if (delErr) {
      console.error(delErr);
      setError('Could not remove that task.');
      return;
    }
    router.refresh();
  }

  async function addFiles(template, fileList) {
    if (!fileList || !fileList.length) return;
    const picked = Array.from(fileList);
    const tooBig = picked.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    const ok = picked.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    if (tooBig.length) {
      setError(`Skipped ${tooBig.map((f) => f.name).join(', ')} — over ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
    }
    if (!ok.length) return;
    setBusy(true);
    try {
      const uploaded = await uploadAttachments(supabase, newAttachmentItems(ok));
      const next = [...(template.attachments || []), ...uploaded];
      const { error: updErr } = await supabase
        .from('project_templates')
        .update({ attachments: next })
        .eq('id', template.id);
      if (updErr) throw updErr;
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Could not upload that file.');
    }
    setBusy(false);
  }

  async function removeFile(template, item) {
    if (!confirm(`Remove ${item.name} from this template? Projects already created from it keep the file.`)) return;
    setBusy(true);
    const next = (template.attachments || []).filter((a) => a.path !== item.path);
    const { error: updErr } = await supabase
      .from('project_templates')
      .update({ attachments: next })
      .eq('id', template.id);
    setBusy(false);
    if (updErr) {
      console.error(updErr);
      setError('Could not remove that file.');
      return;
    }
    // No storage delete, for the same reason as removeTemplate.
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={addTemplate} className="field-row" style={{ alignItems: 'flex-end', marginBottom: 18 }}>
        <div className="field" style={{ flex: '2 1 220px' }}>
          <label>New Template Name</label>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Standard screen install" />
        </div>
        <div className="field" style={{ flex: '1 1 180px' }}>
          <label>Applies To</label>
          <select value={newClient} onChange={(e) => setNewClient(e.target.value)}>
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>Add Template</button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {templates.length === 0 && <div className="empty-state">No templates yet — add one above.</div>}

      {templates.map((t) => {
        const open = openId === t.id;
        return (
          <div className="template-card" key={t.id}>
            <div className="template-head">
              <button type="button" className="template-name" onClick={() => setOpenId(open ? null : t.id)}>
                {t.name}
                <span className="panel-count">{t.tasks.length} task{t.tasks.length === 1 ? '' : 's'}</span>
              </button>
              <span className="client-badge">
                {t.client_id ? (clients.find((c) => c.id === t.client_id)?.name || 'Unknown client') : 'All clients'}
              </span>
              {t.is_default && <span className="client-badge intake-badge">Auto-applied</span>}
              <button className="btn btn-ghost" type="button" onClick={() => toggleDefault(t)} disabled={busy}>
                {t.is_default ? 'Stop auto-applying' : 'Auto-apply to requests'}
              </button>
              <button className="btn btn-danger" type="button" onClick={() => removeTemplate(t)} disabled={busy}>
                Delete
              </button>
            </div>

            {open && (
              <div className="template-body">
                <p className="hint">Everything here saves as you change it.</p>

                <div className="field-row">
                  <div className="field" style={{ flex: '2 1 220px' }}>
                    <label>Template Name</label>
                    <input
                      type="text"
                      defaultValue={valueOf(t, 'name')}
                      onBlur={(e) => patch(t, 'name', e.target.value)}
                    />
                  </div>
                  <div className="field" style={{ flex: '1 1 170px' }}>
                    <label>Applies To</label>
                    <select value={valueOf(t, 'client_id') || ''} onChange={(e) => patch(t, 'client_id', e.target.value)}>
                      <option value="">All clients</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field" style={{ flex: '1 1 160px' }}>
                    <label>Default Priority</label>
                    <select value={valueOf(t, 'priority') || 'normal'} onChange={(e) => patch(t, 'priority', e.target.value)}>
                      {PROJECT_PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ flex: '1 1 200px' }}>
                    <label>Default Owner</label>
                    <select value={valueOf(t, 'default_owner_id') || ''} onChange={(e) => patch(t, 'default_owner_id', e.target.value)}>
                      <option value="">Unassigned</option>
                      {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name || o.email}</option>)}
                    </select>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field" style={{ flex: '1 1 100%' }}>
                    <label>Default Description</label>
                    <textarea
                      defaultValue={valueOf(t, 'description')}
                      onBlur={(e) => patch(t, 'description', e.target.value)}
                      placeholder="Used only when the request doesn't come with its own description."
                    />
                  </div>
                </div>

                <label className="screen-list-label" style={{ marginTop: 6 }}>Tasks</label>
                {t.tasks.length === 0 && <div className="empty-state">No tasks in this template yet.</div>}
                {t.tasks.length > 0 && (
                  <ol className="template-task-list">
                    {t.tasks.map((task) => (
                      <li key={task.id}>
                        <span>{task.title}</span>
                        {task.due_offset_days != null && (
                          <span className="template-task-due">
                            due +{task.due_offset_days} day{task.due_offset_days === 1 ? '' : 's'}
                          </span>
                        )}
                        <button type="button" onClick={() => removeTask(task)} disabled={busy}>Remove</button>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="task-add-row" style={{ marginTop: 12, marginBottom: 0 }}>
                  <input
                    type="text"
                    value={taskDrafts[t.id] || ''}
                    onChange={(e) => setTaskDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTask(t); } }}
                    placeholder="Add a task — e.g. Order hardware"
                  />
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={offsetDrafts[t.id] || ''}
                    onChange={(e) => setOffsetDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                    placeholder="Due in ? days"
                    title="Days after the project is raised that this task is due. Leave blank for no date."
                    style={{ flex: '0 1 140px', width: 'auto' }}
                  />
                  <button className="btn btn-primary" type="button" onClick={() => addTask(t)} disabled={busy}>Add</button>
                </div>

                <label className="screen-list-label" style={{ marginTop: 20 }}>Files</label>
                <p className="hint" style={{ marginBottom: 10 }}>
                  Copied onto every project made from this template. The file itself is shared, so
                  removing it here leaves existing projects untouched.
                </p>
                {(t.attachments || []).length === 0 && <div className="empty-state">No files on this template.</div>}
                {(t.attachments || []).length > 0 && (
                  <div className="attachment-list">
                    {t.attachments.map((a) => (
                      <div className="attachment-row" key={a.path}>
                        <span className="attachment-name">{a.name}</span>
                        <span className="attachment-size">{formatBytes(a.size)}</span>
                        <button type="button" className="attachment-remove" onClick={() => removeFile(t, a)} disabled={busy}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <label className={`attachment-add${busy ? ' busy' : ''}`}>
                  <input type="file" multiple disabled={busy} onChange={(e) => { addFiles(t, e.target.files); e.target.value = ''; }} />
                  <span>{busy ? 'Working…' : '+ Add files'}</span>
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
