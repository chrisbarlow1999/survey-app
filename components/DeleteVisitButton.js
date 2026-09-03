'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';

export function DeleteVisitButton({ visitId, photoPaths }) {
  const supabase = createClient();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('Delete this engineer visit permanently? This cannot be undone.')) return;
    setDeleting(true);
    try {
      if (photoPaths.length) {
        await supabase.storage.from('survey-photos').remove(photoPaths);
      }
      const { error } = await supabase.from('visits').delete().eq('id', visitId);
      if (error) throw error;
      router.push('/visits');
      router.refresh();
    } catch (err) {
      console.error(err);
      alert('Could not delete this visit. Please try again.');
      setDeleting(false);
    }
  }

  return (
    <button className="btn btn-ghost" onClick={handleDelete} disabled={deleting} style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}>
      {deleting ? 'Deleting…' : 'Delete'}
    </button>
  );
}
