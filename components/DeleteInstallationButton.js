'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';

export function DeleteInstallationButton({ installationId, photoPaths }) {
  const supabase = createClient();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('Delete this install confirmation permanently? This cannot be undone.')) return;
    setDeleting(true);
    try {
      if (photoPaths.length) {
        await supabase.storage.from('survey-photos').remove(photoPaths);
      }
      const { error } = await supabase.from('installations').delete().eq('id', installationId);
      if (error) throw error;
      router.push('/installations');
      router.refresh();
    } catch (err) {
      console.error(err);
      alert('Could not delete this installation. Please try again.');
      setDeleting(false);
    }
  }

  return (
    <button className="btn btn-ghost" onClick={handleDelete} disabled={deleting} style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}>
      {deleting ? 'Deleting…' : 'Delete'}
    </button>
  );
}
