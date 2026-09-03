'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { logProjectActivity } from '../lib/logProjectActivity';
import { formatDate } from '../lib/formatDate';

// A flat checklist under the project. Tasks have no owner of their own — the
// project has one, and these are that person's list. Per-task assignees were
// tried first and made no sense: engineers have no accounts, so every task
// ended up owned by the same PM anyway.
export function ProjectTaskList({ projectId, tasks, actorName, readOnly }) {
  const supabase = createClient();
  const router = useRouter();

  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const open = tasks.filter((t) => !t.completed_at);
  const done = tasks.filter((t) => t.completed_at);

  async function addTask(e) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    setError('');
    // Append to the end of the open list rather than the very end, so a new
    // task doesn't sort below everything that's already been completed.
    const position = tasks.length ? Math.max(...tasks.map((t) => t.position || 0)) + 1 : 0;
    const { error: insertErr } = await supabase.from('project_tasks').insert({
      project_id: projectId,
      title,
      due_date: newDue || null,
      position,
    });
    if (insertErr) {
      console.error(insertErr);
      setError('Could not add that task.');
      setAdding(false);
      return;
    }
    await logProjectActivity(supabase, { projectId, actorName, action: 'Task added', detail: title });
    setNewTitle('');
    setNewDue('');
    setAdding(false);
    router.refresh();
  }

  async function toggleTask(task) {
    setBusyId(task.id);
    setError('');
    const completing = !task.completed_at;
    const { error: updateErr } = await supabase
      .from('project_tasks')
      .update({
        completed_at: completing ? new Date().toISOString() : null,
        completed_by: completing ? actorName : null,
      })
      .eq('id', task.id);
    if (updateErr) {
      console.error(updateErr);
      setError('Could not update that task.');
      setBusyId(null);
      return;
    }
    await logProjectActivity(supabase, {
      projectId,
      actorName,
      action: completing ? 'Task completed' : 'Task reopened',
      detail: task.title,
    });
    setBusyId(null);
    router.refresh();
  }

  async function deleteTask(task) {
    if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    setBusyId(task.id);
    setError('');
    const { error: delErr } = await supabase.from('project_tasks').delete().eq('id', task.id);
    if (delErr) {
      console.error(delErr);
      setError('Could not delete that task.');
      setBusyId(null);
      return;
    }
    await logProjectActivity(supabase, { projectId, actorName, action: 'Task deleted', detail: task.title });
    setBusyId(null);
    router.refresh();
  }

  function renderTask(task) {
    const overdue = !task.completed_at && task.due_date && new Date(task.due_date) < new Date(new Date().toDateString());
    return (
      <div className={`task-row${task.completed_at ? ' done' : ''}`} key={task.id}>
        <button
          type="button"
          className={`task-check${task.completed_at ? ' on' : ''}`}
          onClick={() => toggleTask(task)}
          disabled={readOnly || busyId === task.id}
          aria-label={task.completed_at ? 'Reopen task' : 'Mark task complete'}
        >
          {task.completed_at ? '✓' : ''}
        </button>
        <div className="task-body">
          <div className="task-title">{task.title}</div>
          <div className="task-meta">
            {task.due_date && (
              <span className={overdue ? 'task-overdue' : ''}>Due {formatDate(task.due_date)}</span>
            )}
            {task.completed_at && task.completed_by
              ? `${task.due_date ? ' · ' : ''}Done by ${task.completed_by}`
              : ''}
          </div>
        </div>
        {!readOnly && (
          <button
            type="button"
            className="task-delete"
            onClick={() => deleteTask(task)}
            disabled={busyId === task.id}
            aria-label={`Delete task: ${task.title}`}
            title="Delete task"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M6 2.5h4M2.5 4.5h11M4.6 4.5l.6 8.2a1 1 0 0 0 1 .93h3.6a1 1 0 0 0 1-.93l.6-8.2M6.8 7.1v4M9.2 7.1v4" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Tasks {tasks.length > 0 && <span className="area-screen-count">{open.length} open / {tasks.length}</span>}</h2>

      {!readOnly && (
        <form className="task-add-row" onSubmit={addTask}>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a task…"
          />
          <input type="date" min="2000-01-01" max="2100-12-31" value={newDue} onChange={(e) => setNewDue(e.target.value)} title="Due date" />
          <button className="btn btn-primary" type="submit" disabled={adding || !newTitle.trim()}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}

      {error && <p className="error-text">{error}</p>}

      {tasks.length === 0 && <div className="empty-state">No tasks on this project yet.</div>}

      {open.length > 0 && <div className="task-list">{open.map(renderTask)}</div>}

      {done.length > 0 && (
        <>
          <div className="task-group-label">Completed ({done.length})</div>
          <div className="task-list">{done.map(renderTask)}</div>
        </>
      )}
    </div>
  );
}
