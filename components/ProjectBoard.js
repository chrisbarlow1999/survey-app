'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { logProjectActivity } from '../lib/logProjectActivity';
import { formatDate } from '../lib/formatDate';
import { PROJECT_STATUSES, statusLabel } from '../lib/projectStatus';

// Kanban board, one column per status. Drag a card to a new column to move the
// project — the same thing as changing its status on the detail page, and it
// writes the same activity line, so the trail doesn't depend on which screen
// you happened to use.
//
// Cards keep their column's order from the server (due date, then newest); there's
// no manual ordering within a column. Planner has that, but it's the part of a
// board people fiddle with rather than use.
export function ProjectBoard({ projects, actorName, canEdit }) {
  const supabase = createClient();
  const router = useRouter();
  const [dragId, setDragId] = useState(null);
  const [overStatus, setOverStatus] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  const columns = PROJECT_STATUSES.map((s) => ({
    ...s,
    cards: projects.filter((p) => p.status === s.key),
  }));

  // A project saved with a status no longer in the list would otherwise vanish
  // from the board entirely — surface it rather than lose it.
  const known = new Set(PROJECT_STATUSES.map((s) => s.key));
  const orphans = projects.filter((p) => !known.has(p.status));

  async function moveTo(project, status) {
    if (!canEdit || project.status === status) return;
    setSavingId(project.id);
    setError('');
    const { error: updErr } = await supabase.from('projects').update({ status }).eq('id', project.id);
    if (updErr) {
      console.error(updErr);
      setError('Could not move that project.');
      setSavingId(null);
      return;
    }
    await logProjectActivity(supabase, {
      projectId: project.id,
      actorName,
      action: 'Status changed',
      detail: `${statusLabel(project.status)} → ${statusLabel(status)}`,
    });
    setSavingId(null);
    router.refresh();
  }

  function onDrop(e, status) {
    e.preventDefault();
    setOverStatus(null);
    const project = projects.find((p) => p.id === dragId);
    setDragId(null);
    if (project) moveTo(project, status);
  }

  function renderCard(p) {
    const done = p.taskDone;
    const total = p.taskTotal;
    const overdue = p.due_date && !['complete', 'cancelled'].includes(p.status)
      && new Date(p.due_date) < new Date(new Date().toDateString());
    return (
      <div
        key={p.id}
        className={`board-card${savingId === p.id ? ' saving' : ''}`}
        draggable={canEdit}
        onDragStart={() => setDragId(p.id)}
        onDragEnd={() => { setDragId(null); setOverStatus(null); }}
      >
        <div className="board-card-tags">
          {p.clients?.name && <span className="client-badge">{p.clients.name}</span>}
          {p.source === 'intake' && <span className="client-badge intake-badge">Request</span>}
        </div>
        <a className="board-card-title" href={`/projects/${p.id}`}>{p.title}</a>
        {p.site_location && <div className="board-card-site">{p.site_location}</div>}
        <div className="board-card-foot">
          {total > 0 && (
            <span className="board-chip" title={`${done} of ${total} tasks done`}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /></svg>
              {done}/{total}
            </span>
          )}
          {p.noteCount > 0 && (
            <span className="board-chip" title={`${p.noteCount} note${p.noteCount === 1 ? '' : 's'}`}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 10a1.5 1.5 0 0 1-1.5 1.5H5l-3 2.5v-11A1.5 1.5 0 0 1 3.5 1.5h8.5A1.5 1.5 0 0 1 13.5 3z" /></svg>
              {p.noteCount}
            </span>
          )}
          {p.due_date && (
            <span className={`board-chip${overdue ? ' overdue' : ''}`} title="Due date">
              {formatDate(p.due_date)}
            </span>
          )}
          <span className="board-card-owner" title={p.owner?.full_name || p.owner?.email || 'Unassigned'}>
            {initials(p.owner)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && <p className="error-text">{error}</p>}
      {orphans.length > 0 && (
        <div className="archived-banner">
          {orphans.length} project{orphans.length === 1 ? ' has a status' : 's have statuses'} that
          {orphans.length === 1 ? ' is' : ' are'} no longer on the board
          ({[...new Set(orphans.map((o) => o.status))].join(', ')}). They still show in the list view.
        </div>
      )}
      <div className="board">
        {columns.map((col) => (
          <div
            key={col.key}
            className={`board-col${overStatus === col.key ? ' drop-target' : ''}`}
            onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOverStatus(col.key); } }}
            onDragLeave={() => setOverStatus((s) => (s === col.key ? null : s))}
            onDrop={(e) => onDrop(e, col.key)}
          >
            <div className="board-col-head">
              <span className={`board-col-dot tone-${col.tone}`} />
              {col.label}
              <span className="board-col-count">{col.cards.length}</span>
            </div>
            <div className="board-col-body">
              {col.cards.map(renderCard)}
              {col.cards.length === 0 && <div className="board-col-empty">Nothing here</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function initials(owner) {
  const name = owner?.full_name || owner?.email;
  if (!name) return '—';
  const parts = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();
}
