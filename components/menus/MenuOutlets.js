'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';
import { InlineText } from './MenuProducts';
import { screensDisagree } from '../../lib/menus';

// Every outlet with the facts a schedule depends on. The screen counts are the
// master schedule's; the client's figure sits beside them, highlighted where
// the two sources disagree, because that disagreement is exactly what gets
// missed when the two spreadsheets are checked by hand.
export function MenuOutlets({ outlets }) {
  const supabase = createClient();
  const router = useRouter();
  const [error, setError] = useState('');
  const [onlyMismatches, setOnlyMismatches] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  async function save(id, patch) {
    setError('');
    const { error: err } = await supabase.from('menu_outlets').update(patch).eq('id', id);
    if (err) {
      setError(`Could not save: ${err.message}`);
      return false;
    }
    router.refresh();
    return true;
  }

  const count = (v) => {
    if (v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 50 ? n : undefined;
  };

  async function saveCount(id, field, v) {
    const n = count(v);
    if (n === undefined) {
      setError('Screen counts must be whole numbers from 0 to 50, or blank for unknown.');
      return false;
    }
    return save(id, { [field]: n });
  }

  const mismatches = outlets.filter((o) => !o.archived_at && screensDisagree(o));
  const unscheduled = outlets.filter((o) => !o.archived_at && !o.current_schedule && (o.landscape_screens || o.portrait_screens));
  const archivedCount = outlets.filter((o) => o.archived_at).length;
  const rows = outlets
    .filter((o) => showArchived || !o.archived_at)
    .filter((o) => !onlyMismatches || screensDisagree(o));

  return (
    <div className="panel" style={{ padding: '12px 16px' }}>
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <button type="button" className={`btn ${onlyMismatches ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOnlyMismatches((v) => !v)}>
          Screen counts that disagree ({mismatches.length})
        </button>
        {archivedCount > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide' : 'Show'} {archivedCount} archived
          </button>
        )}
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        <strong>Landscape / Portrait</strong> come from the master schedule and are what grouping uses.
        <strong> Client says</strong> is the count on the client&apos;s sheet — highlighted where it disagrees.
        {unscheduled.length > 0 && ` ${unscheduled.length} outlet${unscheduled.length === 1 ? ' has' : 's have'} screens but no schedule.`}
      </p>
      {error && <p className="error-text">{error}</p>}
      {outlets.length === 0 && <div className="empty-state">No outlets yet. Import the client’s range sheet to add them.</div>}
      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="data-table menu-outlet-table">
            <thead>
              <tr>
                <th>Outlet</th><th>Store code</th><th>Menu tier</th><th>Menu type</th>
                <th className="num">Landscape</th><th className="num">Portrait</th><th>Client says</th>
                <th>Schedule today</th><th>Notes</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className={o.archived_at ? 'table-muted' : ''}>
                  <td><InlineText value={o.name} label="Outlet name" required onSave={(v) => save(o.id, { name: v })} /></td>
                  <td><InlineText value={o.store_code} label="Store code" placeholder="—" onSave={(v) => save(o.id, { store_code: v || null })} /></td>
                  <td><InlineText value={o.menu_tier} label="Menu tier" onSave={(v) => save(o.id, { menu_tier: v || null })} /></td>
                  <td><InlineText value={o.menu_type} label="Menu type" onSave={(v) => save(o.id, { menu_type: v || null })} /></td>
                  <td className="num menu-count"><InlineText value={o.landscape_screens == null ? '' : String(o.landscape_screens)} label="Landscape screens" placeholder="?" onSave={(v) => saveCount(o.id, 'landscape_screens', v)} /></td>
                  <td className="num menu-count"><InlineText value={o.portrait_screens == null ? '' : String(o.portrait_screens)} label="Portrait screens" placeholder="?" onSave={(v) => saveCount(o.id, 'portrait_screens', v)} /></td>
                  <td className={screensDisagree(o) ? 'menu-mismatch' : ''}>{o.client_screens || '—'}</td>
                  <td><InlineText value={o.current_schedule} label="Current schedule" placeholder="Not on one" onSave={(v) => save(o.id, { current_schedule: v || null })} /></td>
                  <td><InlineText value={o.notes} label="Notes" onSave={(v) => save(o.id, { notes: v || null })} /></td>
                  <td>
                    <button type="button" className="btn btn-ghost"
                      onClick={() => save(o.id, { archived_at: o.archived_at ? null : new Date().toISOString() })}>
                      {o.archived_at ? 'Restore' : 'Archive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
