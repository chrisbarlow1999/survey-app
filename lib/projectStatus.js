// The project workflow lives here rather than in a database check constraint,
// so reshaping it while the system beds in is a one-line edit instead of a
// migration. Existing rows keep whatever value they were saved with — if you
// remove a status that projects are still using, they'll display as their raw
// key until they're moved on.

export const PROJECT_STATUSES = [
  { key: 'new', label: 'New Request', tone: 'open' },
  { key: 'scoping', label: 'Scoping', tone: 'open' },
  { key: 'survey_booked', label: 'Survey Booked', tone: 'active' },
  { key: 'quoted', label: 'Quoted', tone: 'active' },
  { key: 'approved', label: 'Approved', tone: 'active' },
  { key: 'install_booked', label: 'Install Booked', tone: 'active' },
  { key: 'complete', label: 'Complete', tone: 'done' },
  { key: 'on_hold', label: 'On Hold', tone: 'warn' },
  { key: 'cancelled', label: 'Cancelled', tone: 'warn' },
];

export const PROJECT_PRIORITIES = [
  { key: 'low', label: 'Low' },
  { key: 'normal', label: 'Normal' },
  { key: 'high', label: 'High' },
  { key: 'urgent', label: 'Urgent' },
];

// Anything not in this list is still open work — used by the list page's
// default filter and the stats strip.
export const CLOSED_STATUSES = ['complete', 'cancelled'];

export function statusLabel(key) {
  return PROJECT_STATUSES.find((s) => s.key === key)?.label || key || '—';
}

export function statusTone(key) {
  return PROJECT_STATUSES.find((s) => s.key === key)?.tone || 'open';
}

export function priorityLabel(key) {
  return PROJECT_PRIORITIES.find((p) => p.key === key)?.label || key || '—';
}

export function isClosed(status) {
  return CLOSED_STATUSES.includes(status);
}

// Turns a client name into a URL slug for its intake form. Kept deliberately
// dumb — the admin page lets you override it, and the DB has a unique index.
export function slugify(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
