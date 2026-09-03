'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';

// table is 'surveys', 'installations' or 'visits'. Archiving is a soft delete — the row
// stays, it's just hidden from the default list view and restorable.
export function ArchiveButton({ table, recordId, archived }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    const restoring = archived;
    if (!restoring && !confirm('Archive this record? It will be hidden from the main list but can be restored later.')) return;

    setBusy(true);
    const { error } = await supabase
      .from(table)
      .update({ archived_at: restoring ? null : new Date().toISOString() })
      .eq('id', recordId);
    if (error) {
      console.error(error);
      alert(restoring ? 'Could not restore this record.' : 'Could not archive this record.');
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  return (
    <button className="btn btn-ghost" onClick={handleClick} disabled={busy}>
      {busy ? 'Working…' : archived ? 'Restore' : 'Archive'}
    </button>
  );
}
