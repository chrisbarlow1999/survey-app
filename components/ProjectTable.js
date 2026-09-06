'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { formatDate } from '../lib/formatDate';
import { PROJECT_STATUSES, statusLabel, statusTone } from '../lib/projectStatus';
import { resolveProjectSort } from '../lib/listQuery';
import { screenTotals } from '../lib/screenCount';
import { valueTotals, formatGBP } from '../lib/money';
import { projectHref } from '../lib/projectBackLink';

// The dense management read on the pipeline: one row per project, the columns
// you'd want in a spreadsheet, sortable by clicking a heading, and a place to
// change several projects at once.
//
// Sorting stays a link that reloads with a new ?sort= rather than client-side
// state, so the URL is the whole view — a sorted, filtered table can be
// bookmarked, shared in Teams, or refreshed without losing your place. It also
// means the sort matches what the CSV export produces, because both go through
// resolveProjectSort.
//
// Each sortable column and the sort keys it cycles through, with the arrow that
// belongs to each. The arrow can't be derived from position: "most screens
// first" is the useful default for screens but "soonest" is for dates.
//
// Stage is deliberately absent: ordering by the status column would sort the
// raw keys alphabetically — cancelled, complete, designs, estimating — which
// isn't the workflow. Ordering by workflow position would mean storing that
// position in the database, and lib/projectStatus.js keeps it in JS on purpose
// so the stages can be reshaped without a migration. The Stage filter and the
// Board view already answer "what's sitting at this stage".
const COLS = {
  title: [{ v: 'title_az', a: '↑' }, { v: 'title_za', a: '↓' }],
  screens: [{ v: 'screens_desc', a: '↓' }, { v: 'screens_asc', a: '↑' }],
  value: [{ v: 'value_desc', a: '↓' }, { v: 'value_asc', a: '↑' }],
  install: [{ v: 'install_asc', a: '↑' }, { v: 'install_desc', a: '↓' }],
  due: [{ v: 'due_asc', a: '↑' }, { v: 'due_desc', a: '↓' }],
  created: [{ v: 'newest', a: '↓' }, { v: 'oldest', a: '↑' }],
};

// Carries the filters but drops page — a re-sorted list has a different page 4.
function sortHref(basePath, params, value) {
  const sp = new URLSearchParams();
  ['q', 'client', 'status', 'owner', 'archived'].forEach((k) => {
    if (params?.[k]) sp.set(k, params[k]);
  });
  sp.set('sort', value);
  return `${basePath}?${sp.toString()}`;
}

function SortHeader({ label, col, params, basePath, className }) {
  const opts = COLS[col];
  const current = resolveProjectSort(params?.sort).value;
  const i = opts.findIndex((o) => o.v === current);
  // Clicking the active column flips it; clicking a new one starts at its
  // natural direction.
  const next = i === -1 ? opts[0] : opts[(i + 1) % opts.length];
  return (
    <th className={className} aria-sort={i > -1 ? (opts[i].a === '↑' ? 'ascending' : 'descending') : 'none'}>
      <a className={`th-sort${i > -1 ? ' on' : ''}`} href={sortHref(basePath, params, next.v)}>
        {label}
        <span className="th-arrow">{i > -1 ? opts[i].a : ''}</span>
      </a>
    </th>
  );
}

export function ProjectTable({ projects, params, basePath, today, canEdit, owners = [], actorName }) {
  const supabase = createClient();
  const router = useRouter();
  const rows = projects || [];
  const pageScreens = screenTotals(rows);
  const pageValue = valueTotals(rows);

  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bulkDate, setBulkDate] = useState('');

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)));
  }

  // One update for the whole selection, then one insert for the whole activity
  // trail. logProjectActivity writes a row at a time, which is right for a
  // single change and wrong for twenty — that would be twenty round trips.
  async function applyBulk(patch, action, detail) {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    setError('');
    setNotice('');

    const { data, error: updErr } = await supabase
      .from('projects').update(patch).in('id', ids).select('id');

    if (updErr) {
      console.error(updErr);
      setError('Could not apply that change.');
      setBusy(false);
      return;
    }
    // An update matching no rows returns no error — it just does nothing.
    // Without this the bar would look like it worked on all of them.
    if (!data || data.length === 0) {
      setError('That change was refused — you may not have edit access to these projects.');
      setBusy(false);
      return;
    }
    if (data.length < ids.length) {
      setNotice(`${data.length} of ${ids.length} updated — the rest were refused.`);
    }

    await supabase.from('project_activity').insert(
      data.map((r) => ({
        project_id: r.id,
        actor_name: actorName || 'Unknown user',
        action,
        detail,
      }))
    );

    setSelected(new Set());
    setBulkDate('');
    setBusy(false);
    router.refresh();
  }

  const n = selected.size;

  return (
    <>
      {canEdit && n > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{n} selected</span>

          <select
            className="inline-select"
            value=""
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value;
              if (v) applyBulk({ status: v }, 'Status changed', `Set to ${statusLabel(v)} in bulk`);
            }}
          >
            <option value="">Set stage…</option>
            {PROJECT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>

          <select
            className="inline-select"
            value=""
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const match = owners.find((o) => o.id === v);
              const who = v === 'none' ? 'Unassigned' : (match?.full_name || match?.email || 'Someone else');
              applyBulk({ owner_id: v === 'none' ? null : v }, 'Owner changed', `Set to ${who} in bulk`);
            }}
          >
            <option value="">Set owner…</option>
            <option value="none">Unassigned</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name || o.email}</option>)}
          </select>

          <input
            className="inline-select"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={bulkDate}
            disabled={busy}
            title="Install date"
            onChange={(e) => setBulkDate(e.target.value)}
          />
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy || !bulkDate}
            onClick={() => applyBulk({ install_date: bulkDate }, 'Install date changed', `Set to ${formatDate(bulkDate)} in bulk`)}
          >
            Set install date
          </button>

          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy}
            onClick={() => applyBulk({ archived_at: new Date().toISOString() }, 'Archived', 'Archived in bulk')}
          >
            Archive
          </button>

          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
      {notice && <p className="hint">{notice}</p>}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {canEdit && (
                <th className="tick">
                  <input
                    type="checkbox"
                    checked={allOnPage}
                    onChange={toggleAll}
                    aria-label="Select every project on this page"
                  />
                </th>
              )}
              <SortHeader label="Project" col="title" params={params} basePath={basePath} />
              <th>Client</th>
              <th>Stage</th>
              <th>Owner</th>
              <SortHeader label="Screens" col="screens" params={params} basePath={basePath} className="num" />
              <SortHeader label="Value" col="value" params={params} basePath={basePath} className="num" />
              <SortHeader label="Install" col="install" params={params} basePath={basePath} />
              <SortHeader label="Due" col="due" params={params} basePath={basePath} />
              <th className="num">Tasks</th>
              <SortHeader label="Raised" col="created" params={params} basePath={basePath} />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              // Only chase a date on work that's still live — a completed job
              // whose install date has passed is not late.
              const live = !['complete', 'cancelled'].includes(p.status);
              const dueLate = live && p.due_date && p.due_date < today;
              const installLate = live && p.install_date && p.install_date < today;
              return (
                <tr key={p.id} className={selected.has(p.id) ? 'picked' : ''}>
                  {canEdit && (
                    <td className="tick">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                        aria-label={`Select ${p.title}`}
                      />
                    </td>
                  )}
                  <td>
                    <a className="table-title" href={projectHref(p.id, basePath, params)}>{p.title}</a>
                    {(p.reference || p.site_location) && (
                      <div className="table-sub">
                        {[p.reference, p.site_location].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td>{p.clients?.name || '—'}</td>
                  <td>
                    <span className={`status-pill status-${statusTone(p.status)}`}>{statusLabel(p.status)}</span>
                  </td>
                  <td>{p.owner?.full_name || p.owner?.email || <span className="table-muted">Unassigned</span>}</td>
                  {/* Blank, not 0, when unestimated — see lib/screenCount.js. */}
                  <td className="num">
                    {p.screen_count == null ? <span className="table-muted">—</span> : p.screen_count}
                  </td>
                  {/* Blank, not £0, when unquoted — see lib/money.js. */}
                  <td className="num">
                    {p.value_gbp == null ? <span className="table-muted">—</span> : formatGBP(p.value_gbp)}
                  </td>
                  <td className={installLate ? 'table-late' : ''}>
                    {p.install_date ? formatDate(p.install_date) : <span className="table-muted">—</span>}
                  </td>
                  <td className={dueLate ? 'table-late' : ''}>
                    {p.due_date ? formatDate(p.due_date) : <span className="table-muted">—</span>}
                  </td>
                  <td className="num">
                    {p.taskTotal > 0
                      ? <span className={p.taskDone === p.taskTotal ? 'table-done' : ''}>{p.taskDone}/{p.taskTotal}</span>
                      : <span className="table-muted">—</span>}
                  </td>
                  <td>{formatDate(p.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                {/* Says "this page" on purpose. The figure for the whole
                    filtered set is in the strip above — a footer total that
                    silently meant only 25 of 80 projects would be read as the
                    real number. */}
                <td colSpan={canEdit ? 5 : 4}>This page ({rows.length} project{rows.length === 1 ? '' : 's'})</td>
                <td className="num">{pageScreens.total}</td>
                <td className="num">{pageValue.quoted > 0 ? formatGBP(pageValue.total) : '—'}</td>
                <td colSpan={4}>
                  {[
                    pageScreens.unestimated > 0 ? `${pageScreens.unestimated} without a screen estimate` : null,
                    pageValue.unquoted > 0 ? `${pageValue.unquoted} not quoted` : null,
                  ].filter(Boolean).join(' · ')}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
