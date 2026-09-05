'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { logProjectActivity } from '../lib/logProjectActivity';
import { formatDate, formatDateTime } from '../lib/formatDate';
import { PROJECT_STATUSES, PROJECT_PRIORITIES, statusLabel, statusTone, priorityLabel } from '../lib/projectStatus';
import { screenLabel } from '../lib/screenCount';

// Planner-style editing: change a field in place, it saves, no Edit button and
// no separate page. The full form still exists for creating a project and for
// attachments, but day-to-day nudging happens here.
//
// Everything saves through one `save()` so the activity trail is written the
// same way regardless of which field moved, and so a failure can roll the
// display back rather than leaving the screen lying about what's stored.
export function ProjectDetailsPanel({ project, clients, owners, actorName, canEdit, surveyedScreens = 0 }) {
  const supabase = createClient();
  const router = useRouter();

  const [values, setValues] = useState({
    title: project.title || '',
    reference: project.reference || '',
    site_location: project.site_location || '',
    address: project.address || '',
    description: project.description || '',
    status: project.status || 'new',
    priority: project.priority || 'normal',
    due_date: project.due_date || '',
    install_date: project.install_date || '',
    // Kept as '' rather than 0 when unset — see lib/screenCount.js. An empty
    // box means nobody has estimated it, which the pipeline figure reports
    // separately from a project that genuinely needs no screens.
    screen_count: project.screen_count ?? '',
    screen_count: project.screen_count ?? '',
    owner_id: project.owner_id || '',
    client_id: project.client_id || '',
    requested_by: project.requested_by || '',
    requester_email: project.requester_email || '',
  });
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState('');
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState('');

  function ownerName(id) {
    if (!id) return 'Unassigned';
    const o = owners.find((x) => x.id === id);
    return o ? (o.full_name || o.email) : 'Someone else';
  }
  function clientName(id) {
    return clients.find((c) => c.id === id)?.name || '—';
  }

  // What gets written to the activity feed. Only the changes worth a line get
  // one — retyping an address shouldn't read like a milestone.
  function activityFor(key, from, to) {
    if (key === 'status') {
      return { action: 'Status changed', detail: `${statusLabel(from)} → ${statusLabel(to)}` };
    }
    if (key === 'owner_id') {
      return { action: 'Owner changed', detail: `${ownerName(from)} → ${ownerName(to)}` };
    }
    if (key === 'due_date') {
      return { action: 'Due date changed', detail: `${from ? formatDate(from) : 'None'} → ${to ? formatDate(to) : 'None'}` };
    }
    // Worth its own line in the trail: this is the date engineers are booked
    // against, so "who moved it and when" is a real question later.
    if (key === 'install_date') {
      return { action: 'Install date changed', detail: `${from ? formatDate(from) : 'Not booked'} → ${to ? formatDate(to) : 'Not booked'}` };
    }
    if (key === 'client_id') {
      return { action: 'Client changed', detail: `${clientName(from)} → ${clientName(to)}` };
    }
    if (key === 'screen_count') {
      const show = (v) => (v === '' || v == null ? 'Not estimated' : v);
      return { action: 'Screen count changed', detail: show(from) + ' → ' + show(to) };
    }
    if (key === 'priority') {
      return { action: 'Priority changed', detail: `${priorityLabel(from)} → ${priorityLabel(to)}` };
    }
    return null;
  }

  async function save(key, rawValue) {
    const previous = values[key];
    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    if (value === previous) {
      setEditingKey(null);
      return;
    }
    // The number input hands back a string while the stored value is a
    // number, so the check above never matches for screens. Without this,
    // tabbing out of an untouched box writes a row and logs "6 → 6".
    if (key === 'screen_count') {
      const norm = (v) => (v === '' || v == null ? null : Number(v));
      if (norm(value) === norm(previous)) {
        setEditingKey(null);
        return;
      }
    }
    if (key === 'title' && !value) {
      setError('A project needs a title.');
      setEditingKey(null);
      return;
    }
    if (key === 'client_id' && !value) {
      setError('A project needs a client.');
      setEditingKey(null);
      return;
    }
    // Caught here as well as by the check constraint in migration 029, so a
    // typo reads as a sentence rather than as a raw Postgres violation.
    if (key === 'screen_count' && value !== '') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 10000) {
        setError('Screens needs to be a whole number between 0 and 10,000.');
        setEditingKey(null);
        return;
      }
    }

    setSavingKey(key);
    setError('');
    setEditingKey(null);
    // Optimistic: the field shows the new value straight away and rolls back if
    // the write is refused.
    setValues((v) => ({ ...v, [key]: value }));

    const nullable = ['reference', 'site_location', 'address', 'description', 'due_date', 'install_date', 'owner_id', 'requested_by', 'requester_email', 'screen_count'];
    // screen_count is an integer column, so a cleared box has to be written as
    // null. Sending '' would be rejected outright, and sending 0 would claim
    // the project needs no screens.
    const toWrite = key === 'screen_count'
      ? (value === '' ? null : Number(value))
      : (nullable.includes(key) ? (value || null) : value);
    const { error: updErr } = await supabase
      .from('projects')
      .update({ [key]: toWrite })
      .eq('id', project.id);

    if (updErr) {
      console.error(updErr);
      setValues((v) => ({ ...v, [key]: previous }));
      setError('Could not save that change.');
      setSavingKey(null);
      return;
    }

    const entry = activityFor(key, previous, value);
    if (entry) await logProjectActivity(supabase, { projectId: project.id, actorName, ...entry });

    setSavingKey(null);
    router.refresh();
  }

  // Click-to-edit text field. Enter commits, Escape abandons, blur commits —
  // the same contract as a spreadsheet cell.
  function TextField({ label, fieldKey, placeholder, multiline }) {
    const editing = editingKey === fieldKey;
    const value = values[fieldKey];
    if (!canEdit) {
      return (
        <div className="kv">
          <div className="k">{label}</div>
          <div className="v">{value || '—'}</div>
        </div>
      );
    }
    return (
      <div className={`kv inline-kv${savingKey === fieldKey ? ' saving' : ''}`}>
        <div className="k">{label}</div>
        {editing ? (
          multiline ? (
            <textarea
              className="inline-input inline-textarea"
              autoFocus
              rows={Math.max(3, draft.split('\n').length + 1)}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => save(fieldKey, draft)}
              onKeyDown={(e) => { if (e.key === 'Escape') setEditingKey(null); }}
            />
          ) : (
            <input
              type="text"
              className="inline-input"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => save(fieldKey, draft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                if (e.key === 'Escape') setEditingKey(null);
              }}
            />
          )
        ) : (
          <button
            type="button"
            className={`v inline-value${value ? '' : ' empty'}`}
            onClick={() => { setEditingKey(fieldKey); setDraft(value); }}
            title="Click to edit"
          >
            {value || placeholder || 'Add…'}
          </button>
        )}
      </div>
    );
  }

  function SelectField({ label, fieldKey, options, render }) {
    const value = values[fieldKey];
    if (!canEdit) {
      return (
        <div className="kv">
          <div className="k">{label}</div>
          <div className="v">{render ? render(value) : value}</div>
        </div>
      );
    }
    return (
      <div className={`kv inline-kv${savingKey === fieldKey ? ' saving' : ''}`}>
        <div className="k">{label}</div>
        <select className="inline-select" value={value} onChange={(e) => save(fieldKey, e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="project-title-row">
        {canEdit && editingKey === 'title' ? (
          <input
            type="text"
            className="inline-input project-title-input"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => save('title', draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
              if (e.key === 'Escape') setEditingKey(null);
            }}
          />
        ) : (
          <h2
            className={`project-title${canEdit ? ' editable' : ''}`}
            onClick={() => { if (canEdit) { setEditingKey('title'); setDraft(values.title); } }}
            title={canEdit ? 'Click to edit' : undefined}
          >
            {values.title}
          </h2>
        )}
        <span className={`status-pill status-${statusTone(values.status)}`}>{statusLabel(values.status)}</span>
        {project.source === 'intake' && <span className="client-badge intake-badge">Request</span>}
      </div>

      {error && <p className="error-text">{error}</p>}
      {canEdit && <p className="hint">Click any field to change it — everything saves as you go.</p>}

      <div className="kv-grid">
        <SelectField
          label="Status"
          fieldKey="status"
          options={PROJECT_STATUSES.map((s) => ({ value: s.key, label: s.label }))}
        />
        <SelectField
          label="Owner"
          fieldKey="owner_id"
          options={[{ value: '', label: 'Unassigned' }, ...owners.map((o) => ({ value: o.id, label: o.full_name || o.email }))]}
          render={ownerName}
        />
        <SelectField
          label="Client"
          fieldKey="client_id"
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
          render={clientName}
        />
        <SelectField
          label="Priority"
          fieldKey="priority"
          options={PROJECT_PRIORITIES.map((p) => ({ value: p.key, label: p.label }))}
          render={priorityLabel}
        />
        <div className={`kv inline-kv${savingKey === 'due_date' ? ' saving' : ''}`}>
          <div className="k">Due Date</div>
          {canEdit ? (
            <input
              className="inline-select"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              value={values.due_date || ''}
              onChange={(e) => save('due_date', e.target.value)}
            />
          ) : (
            <div className="v">{values.due_date ? formatDate(values.due_date) : '—'}</div>
          )}
        </div>
        {/* Not click-to-edit like the text fields: this is the number
            management reports on, so it's always visible and always ready to
            type into, the same as Due Date. Saves on blur rather than on every
            keystroke. */}
        <div className={`kv inline-kv${savingKey === 'screen_count' ? ' saving' : ''}`}>
          <div className="k" title={surveyedScreens > 0 ? 'Forecast for the pipeline. The surveyed figure is what engineers have actually recorded.' : undefined}>
            Screens{surveyedScreens > 0 ? ` · ${surveyedScreens} surveyed` : ''}
          </div>
          {canEdit ? (
            <input
              className="inline-select"
              type="number"
              min="0"
              max="10000"
              step="1"
              placeholder="Not estimated"
              // Remounts when the stored value changes, so a rejected save
              // rolls the box back instead of leaving the bad number on screen.
              key={`screens-${values.screen_count}`}
              defaultValue={values.screen_count}
              onBlur={(e) => save('screen_count', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
            />
          ) : (
            <div className="v">{screenLabel(values.screen_count === '' ? null : values.screen_count)}</div>
          )}
        </div>
        <div className={`kv inline-kv${savingKey === 'install_date' ? ' saving' : ''}`}>
          <div className="k" title="When engineers are booked to fit it. Separate from the client's requested deadline.">Install Date</div>
          {canEdit ? (
            <input
              className="inline-select"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              value={values.install_date || ''}
              onChange={(e) => save('install_date', e.target.value)}
            />
          ) : (
            <div className="v">{values.install_date ? formatDate(values.install_date) : '—'}</div>
          )}
        </div>
        <TextField label="Reference" fieldKey="reference" placeholder="Add a job number…" />
        <TextField label="Site" fieldKey="site_location" placeholder="Add a site…" />
        <TextField label="Address" fieldKey="address" placeholder="Add an address…" multiline />
      </div>

      <TextField label="Description" fieldKey="description" placeholder="Add a description…" multiline />

      <div className="kv-grid">
        <TextField label="Requested By" fieldKey="requested_by" placeholder="Add a name…" />
        <TextField label="Requester Email" fieldKey="requester_email" placeholder="Add an email…" />
      </div>

      <p className="project-raised">Raised {formatDateTime(project.created_at)}</p>
    </div>
  );
}
