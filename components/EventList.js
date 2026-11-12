'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { formatDate } from '../lib/formatDate';
import { startOfWeek } from '../lib/installCalendar';
import {
  CONTENT_STATUS,
  contentStatusLabel,
  contentStatusTone,
  eventStatusTone,
  eventStatusLabel,
  groupByWeek,
  daysUntil,
  eventDateLabel,
} from '../lib/events';

// What's on, week by week, and what's been chased.
//
// A suggested event is a draft: it shows what the model found and where it said
// it found it, and does nothing until someone confirms it. Confirming is the
// only way an event starts counting, because this list is what the team emails
// clients from.
export function EventList({ events, canEdit, today }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const weeks = groupByWeek(events || [], startOfWeek);

  async function patch(event, fields, label) {
    setBusy(event.id);
    setError('');
    const { data, error: updErr } = await supabase
      .from('venue_events')
      .update(fields)
      .eq('id', event.id)
      .select('id');
    setBusy(null);
    if (updErr) {
      console.error(updErr);
      setError(`Could not ${label}.`);
      return;
    }
    // An update matching no rows returns no error — it just does nothing.
    if (!data || data.length === 0) {
      setError('That change was refused — you may not have access to this event.');
      return;
    }
    router.refresh();
  }

  if (weeks.length === 0) {
    return (
      <div className="panel">
        <div className="empty-state">
          Nothing in this range. Add an event by hand, or draft a list with the button above.
        </div>
      </div>
    );
  }

  return (
    <>
      {error && <p className="error-text">{error}</p>}
      {weeks.map(([weekStart, list]) => (
        <div className="panel" style={{ padding: '12px 16px' }} key={weekStart}>
          <h2 style={{ fontSize: 15 }}>
            Week of {formatDate(weekStart)}
            <span className="panel-count">{list.length}</span>
          </h2>
          {list.map((e) => {
            const away = daysUntil(e.event_date, today);
            const suggested = e.status === 'suggested';
            return (
              <div className={`event-row${e.status === 'dismissed' ? ' muted' : ''}`} key={e.id}>
                <div className="event-when">
                  <span className="event-date">{eventDateLabel(e, formatDate)}</span>
                  {/* Urgency is the whole reason for the page — how long is
                      left to get artwork in. */}
                  <span className={`event-away${away != null && away <= 7 ? ' soon' : ''}`}>
                    {away == null ? '' : away < 0 ? 'passed' : away === 0 ? 'today' : `in ${away} day${away === 1 ? '' : 's'}`}
                  </span>
                </div>

                <div className="event-main">
                  <div className="site">
                    {e.title}
                    {e.event_type ? <span className="client-badge">{e.event_type}</span> : null}
                    {e.source === 'ai' && suggested ? <span className="client-badge intake-badge">AI draft</span> : null}
                  </div>
                  <div className="meta">
                    {e.venue_name}
                    {e.client_name ? ` · ${e.client_name}` : ''}
                    {e.town ? ` · ${e.town}` : ''}
                  </div>
                  {/* Shown on drafts so the date can actually be checked
                      before anyone emails a client about it. */}
                  {suggested && e.source_note && (
                    <div className="event-source">Source: {e.source_note}</div>
                  )}
                  {e.notes && <div className="meta">{e.notes}</div>}
                </div>

                <div className="event-actions">
                  {suggested ? (
                    <>
                      <span className={`status-pill status-${eventStatusTone(e.status)}`}>
                        {eventStatusLabel(e.status)}
                      </span>
                      {canEdit && (
                        <>
                          <button
                            className="btn btn-primary"
                            type="button"
                            disabled={busy === e.id}
                            onClick={() => patch(e, { status: 'confirmed', decided_at: new Date().toISOString() }, 'confirm this event')}
                          >
                            Confirm
                          </button>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            disabled={busy === e.id}
                            onClick={() => patch(e, { status: 'dismissed', decided_at: new Date().toISOString() }, 'dismiss this event')}
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </>
                  ) : e.status === 'dismissed' ? (
                    <>
                      <span className="status-pill status-open">Dismissed</span>
                      {canEdit && (
                        <button
                          className="btn btn-ghost"
                          type="button"
                          disabled={busy === e.id}
                          onClick={() => patch(e, { status: 'suggested', decided_at: null }, 'restore this event')}
                        >
                          Restore
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <span className={`status-pill status-${contentStatusTone(e.content_status)}`}>
                        {contentStatusLabel(e.content_status)}
                      </span>
                      {canEdit && (
                        <select
                          className="inline-select"
                          value={e.content_status}
                          disabled={busy === e.id}
                          onChange={(ev) => patch(e, { content_status: ev.target.value }, 'update the content status')}
                        >
                          {Object.entries(CONTENT_STATUS).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
