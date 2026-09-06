'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { logProjectActivity } from '../lib/logProjectActivity';

// For a rollout: store 12 is the same shape as store 11. A template already
// covers the checklist, but not the client, the screen count, the owner or the
// description — this copies the shape of a job you've already set up.
//
// WHAT IT DELIBERATELY DOESN'T COPY
// Site, address and both dates are cleared, because those are the things that
// make it a different job — carrying them over would produce a convincing
// duplicate of the wrong site, which is worse than an obviously blank one.
// Status resets to the first stage, and the trail (notes, activity, approval
// state, edit history) belongs to the original and stays there.
export function DuplicateProjectButton({ project, tasks, actorName }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function duplicate() {
    setBusy(true);
    setError('');

    const { data, error: insErr } = await supabase
      .from('projects')
      .insert({
        client_id: project.client_id,
        title: `${project.title} (copy)`,
        description: project.description,
        priority: project.priority,
        owner_id: project.owner_id,
        screen_count: project.screen_count,
        value_gbp: project.value_gbp,
        // Files are shared by path rather than duplicated in storage, matching
        // how templates already work — see migration 023.
        attachments: project.attachments || [],
        status: 'new',
        source: 'manual',
      })
      .select('id')
      .single();

    if (insErr || !data) {
      console.error(insErr);
      setError('Could not duplicate this project.');
      setBusy(false);
      return;
    }

    // Task list comes across unticked and undated. Copying completion would
    // claim work was done on a job that hasn't started; copying due dates that
    // have already passed would land the new project overdue on day one.
    const rows = (tasks || []).map((t, i) => ({
      project_id: data.id,
      title: t.title,
      position: i,
    }));
    if (rows.length) {
      const { error: taskErr } = await supabase.from('project_tasks').insert(rows);
      if (taskErr) console.error(taskErr);
    }

    await logProjectActivity(supabase, {
      projectId: data.id,
      actorName,
      action: 'Project created',
      detail: `Duplicated from ${project.title}${rows.length ? ` · ${rows.length} task${rows.length === 1 ? '' : 's'} copied` : ''}`,
    });
    // Logged on the original too, so it's clear from either end that a second
    // job was spun off this one.
    await logProjectActivity(supabase, {
      projectId: project.id,
      actorName,
      action: 'Duplicated',
      detail: 'A new project was created from this one',
    });

    router.push(`/projects/${data.id}`);
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-ghost" type="button" disabled={busy} onClick={duplicate}>
        {busy ? 'Duplicating…' : 'Duplicate'}
      </button>
      {error && <p className="error-text">{error}</p>}
    </>
  );
}
