'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { formatDateTime } from '../lib/formatDate';

// The running commentary on a project — the stuff that never fits a field.
// Separate from the Activity panel on purpose: that one is the automatic audit
// trail, this one is people talking. Notes are not written to Activity, or
// every message would show up twice.
export function ProjectNotes({ projectId, notes, currentUserId, isSuperAdmin, actorName, readOnly }) {
  const supabase = createClient();
  const router = useRouter();

  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  async function send(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError('');
    const { error: insErr } = await supabase.from('project_notes').insert({
      project_id: projectId,
      author_id: currentUserId,
      author_name: actorName,
      body: text,
    });
    setSending(false);
    if (insErr) {
      console.error(insErr);
      setError('Could not post that note.');
      return;
    }
    setBody('');
    router.refresh();
  }

  async function saveEdit(note) {
    const text = editingBody.trim();
    if (!text) return;
    setBusyId(note.id);
    const { error: updErr } = await supabase
      .from('project_notes')
      .update({ body: text, edited_at: new Date().toISOString() })
      .eq('id', note.id);
    setBusyId(null);
    setEditingId(null);
    if (updErr) {
      console.error(updErr);
      setError('Could not save that edit.');
      return;
    }
    router.refresh();
  }

  async function remove(note) {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    setBusyId(note.id);
    const { error: delErr } = await supabase.from('project_notes').delete().eq('id', note.id);
    setBusyId(null);
    if (delErr) {
      console.error(delErr);
      setError('Could not delete that note.');
      return;
    }
    router.refresh();
  }

  // Enter sends, Shift+Enter makes a new line — what everyone expects from a
  // message box, and these are usually one-liners.
  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(e);
    }
  }

  return (
    <div className="panel">
      <h2>Notes {notes.length > 0 && <span className="panel-count">{notes.length}</span>}</h2>
      <p className="hint">
        Anything that doesn&apos;t fit a field or a task — dates being chased, what the client said,
        why something is on hold. Everyone with access to this project can read them.
      </p>

      {error && <p className="error-text">{error}</p>}

      {notes.length === 0 && <div className="empty-state">No notes yet.</div>}

      {notes.length > 0 && (
        <div className="note-list">
          {notes.map((n) => {
            const mine = n.author_id && n.author_id === currentUserId;
            return (
              <div className={`note${mine ? ' mine' : ''}`} key={n.id}>
                <div className="note-head">
                  <span className="note-author">{n.author_name || 'Unknown user'}</span>
                  <span className="note-time">
                    {formatDateTime(n.created_at)}
                    {n.edited_at ? ' · edited' : ''}
                  </span>
                </div>
                {editingId === n.id ? (
                  <div className="note-edit">
                    <textarea value={editingBody} onChange={(e) => setEditingBody(e.target.value)} autoFocus />
                    <div className="note-edit-actions">
                      <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                      <button className="btn btn-primary" type="button" onClick={() => saveEdit(n)} disabled={busyId === n.id}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="note-body">{n.body}</div>
                )}
                {!readOnly && editingId !== n.id && (mine || isSuperAdmin) && (
                  <div className="note-actions">
                    {mine && (
                      <button type="button" onClick={() => { setEditingId(n.id); setEditingBody(n.body); }}>Edit</button>
                    )}
                    <button type="button" onClick={() => remove(n)} disabled={busyId === n.id}>Delete</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <form className="note-composer" onSubmit={send}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Add a note…  (Enter to send, Shift+Enter for a new line)"
            rows={2}
          />
          <button className="btn btn-primary" type="submit" disabled={sending || !body.trim()}>
            {sending ? 'Posting…' : 'Post'}
          </button>
        </form>
      )}
    </div>
  );
}
