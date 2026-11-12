// Vocabulary and grouping for client events.
//
// Kept in JS rather than database enums, the same way the project workflow,
// mount types and engineering firms are: adding a venue kind or renaming a
// content step is a one-line edit with no migration.

// Where a draft event has got to. Nothing an AI suggested counts until someone
// confirms it — see migration 042.
export const EVENT_STATUS = {
  suggested: { label: 'Needs checking', tone: 'warn' },
  confirmed: { label: 'Confirmed', tone: 'done' },
  dismissed: { label: 'Dismissed', tone: 'open' },
};

// The chasing workflow — the part the weekly prompt could never do, because it
// has no memory of what you already asked for.
export const CONTENT_STATUS = {
  not_asked: { label: 'Not asked', tone: 'open' },
  asked: { label: 'Asked', tone: 'active' },
  received: { label: 'Received', tone: 'warn' },
  ready: { label: 'Ready', tone: 'done' },
};

export const VENUE_KINDS = ['Stadium', 'Arena', 'Racecourse', 'Conference centre', 'Other'];

export function eventStatusLabel(key) {
  return EVENT_STATUS[key]?.label || key || '—';
}
export function eventStatusTone(key) {
  return EVENT_STATUS[key]?.tone || 'open';
}
export function contentStatusLabel(key) {
  return CONTENT_STATUS[key]?.label || key || '—';
}
export function contentStatusTone(key) {
  return CONTENT_STATUS[key]?.tone || 'open';
}

// Days between today and an event, for "in 3 days" urgency. Plain date strings
// compared through Date.UTC, the same rule as the install calendar: event_date
// is a Postgres `date` with no zone.
export function daysUntil(iso, todayIso) {
  if (!iso || !todayIso) return null;
  const toUtc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(iso) - toUtc(todayIso)) / 86400000);
}

// An event still needs chasing if nobody has the artwork yet. Dismissed events
// and ones already marked ready are out of the way.
export function needsChasing(event) {
  return event.status !== 'dismissed'
    && event.content_status !== 'ready'
    && event.content_status !== 'received';
}

// Groups events into the weeks they fall in, for the week view. Weeks start
// Monday, matching the install calendar.
export function groupByWeek(events, startOfWeek) {
  const weeks = new Map();
  for (const e of events || []) {
    const key = startOfWeek(e.event_date);
    const list = weeks.get(key) || [];
    list.push(e);
    weeks.set(key, list);
  }
  for (const list of weeks.values()) {
    list.sort((a, b) =>
      a.event_date.localeCompare(b.event_date)
      || (a.venue_name || '').localeCompare(b.venue_name || '')
      || (a.title || '').localeCompare(b.title || '')
    );
  }
  return [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// A multi-day event reads as a range; a single day reads as a day.
export function eventDateLabel(event, formatDate) {
  if (event.end_date && event.end_date !== event.event_date) {
    return `${formatDate(event.event_date)} – ${formatDate(event.end_date)}`;
  }
  return formatDate(event.event_date);
}
