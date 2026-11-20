// Stages for one site within a project (project_sites.status, migration 044).
// Like lib/projectStatus.js, these live here rather than in a check
// constraint, so they can be reshaped without a migration. A site saved with a
// key that's since been removed shows as its raw key until it's moved on.
//
// `client` is the wording on the client's tracking page.
export const SITE_STATUSES = [
  { key: 'pending', label: 'Awaiting survey', client: 'Getting started', tone: 'open' },
  { key: 'surveyed', label: 'Surveyed', client: 'Surveyed', tone: 'active' },
  { key: 'approved', label: 'Approved', client: 'Approved — ready to book', tone: 'active' },
  { key: 'install_booked', label: 'Install booked', client: 'Installation booked', tone: 'active' },
  { key: 'installed', label: 'Installed', client: 'Installed', tone: 'done' },
  { key: 'on_hold', label: 'On hold', client: 'On hold', tone: 'warn' },
  { key: 'cancelled', label: 'Cancelled', client: 'Cancelled', tone: 'warn' },
];

export const CLOSED_SITE_STATUSES = ['installed', 'cancelled'];

export function siteStatusLabel(key) {
  return SITE_STATUSES.find((s) => s.key === key)?.label || key || '—';
}

export function siteStatusClientLabel(key) {
  return SITE_STATUSES.find((s) => s.key === key)?.client || key || '—';
}

export function siteStatusTone(key) {
  return SITE_STATUSES.find((s) => s.key === key)?.tone || 'open';
}

// Counts per stage, in stage order, skipping empty stages — for the summary
// strip on the project page.
export function siteStageCounts(sites) {
  const counts = new Map();
  for (const s of sites) counts.set(s.status, (counts.get(s.status) || 0) + 1);
  const out = SITE_STATUSES.filter((st) => counts.has(st.key)).map((st) => ({ ...st, count: counts.get(st.key) }));
  for (const [key, count] of counts) {
    if (!SITE_STATUSES.some((st) => st.key === key)) out.push({ key, label: key, tone: 'open', count });
  }
  return out;
}

// The fields a site carries, empty — shared by the request form and the
// project page's add/edit form so the two can't drift.
export function freshSiteDetails() {
  return {
    site_name: '',
    address: '',
    cost_centre: '',
    unit_number: '',
    manager_name: '',
    manager_phone: '',
    manager_email: '',
    screen_count: '',
    opening_hours: '',
    install_preferences: '',
    notes: '',
    access_answers: {},
    rams_required: '',
  };
}

// 'Yes' / 'No' / '' in a form ↔ true / false / null in the database.
export function ramsToForm(value) {
  return value === true ? 'Yes' : value === false ? 'No' : '';
}
export function ramsFromForm(value) {
  return value === 'Yes' ? true : value === 'No' ? false : null;
}
