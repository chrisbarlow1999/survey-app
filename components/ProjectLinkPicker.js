'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { logProjectActivity } from '../lib/logProjectActivity';

// Attaches a survey / install / visit to a project after the fact. Engineers
// filling in the public forms have no idea which project a job belongs to, so
// this is always a PM action on the record's own page.
//
// Only projects for the same client are offered — a survey for Compass has no
// business hanging off a Starbucks project.
export function ProjectLinkPicker({ table, recordId, currentProjectId, projects, actorName, recordLabel }) {
  const supabase = createClient();
  const router = useRouter();
  const [value, setValue] = useState(currentProjectId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const current = projects.find((p) => p.id === currentProjectId);

  async function save() {
    setBusy(true);
    setError('');
    const nextId = value || null;
    const { error: updErr } = await supabase.from(table).update({ project_id: nextId }).eq('id', recordId);
    if (updErr) {
      console.error(updErr);
      setError('Could not update the linked project.');
      setBusy(false);
      return;
    }
    // Logged on both sides so unlinking leaves a trace on the project it left.
    if (currentProjectId && currentProjectId !== nextId) {
      await logProjectActivity(supabase, {
        projectId: currentProjectId, actorName, action: 'Record unlinked', detail: recordLabel,
      });
    }
    if (nextId && nextId !== currentProjectId) {
      await logProjectActivity(supabase, {
        projectId: nextId, actorName, action: 'Record linked', detail: recordLabel,
      });
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="kv no-print" style={{ borderColor: 'var(--accent-cyan)' }}>
      <div className="k">Project</div>
      <div className="project-link-row">
        <select value={value} onChange={(e) => setValue(e.target.value)} disabled={busy}>
          <option value="">Not linked to a project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}{p.reference ? ` (${p.reference})` : ''}</option>
          ))}
        </select>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={save}
          disabled={busy || value === (currentProjectId || '')}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {current && <a className="btn btn-ghost" href={`/projects/${current.id}`}>Open</a>}
      </div>
      {projects.length === 0 && (
        <p className="hint" style={{ margin: '8px 0 0' }}>
          No projects for this client yet.
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
