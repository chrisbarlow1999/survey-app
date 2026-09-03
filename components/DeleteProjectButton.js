'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';

// Tasks and activity cascade with the project (see migration 018), so only the
// attachment files need clearing up by hand.
export function DeleteProjectButton({ projectId, attachmentPaths }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm('Permanently delete this project, its tasks and its activity history? This cannot be undone — use Archive instead if you just want it out of the way.')) return;

    setBusy(true);
    if (attachmentPaths.length) {
      await supabase.storage.from('survey-photos').remove(attachmentPaths).catch(() => {});
    }
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) {
      console.error(error);
      alert('Could not delete this project. Any surveys or installs linked to it may need unlinking first.');
      setBusy(false);
      return;
    }
    router.push('/projects');
    router.refresh();
  }

  return (
    <button className="btn btn-danger" onClick={handleDelete} disabled={busy}>
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}
