// Shared by the request form, the project page and the client's tracking page.

// How close a requested date has to be before the client is offered a self
// survey instead of waiting for an engineer. The database applies the same
// rule in project_self_survey_eligible() (migration 043) — change both.
export const SELF_SURVEY_WINDOW_DAYS = 21;

function todayLocal() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// True when an ISO date (yyyy-mm-dd) falls within the window from `from`
// (default: today). A date already passed counts — it's even more urgent.
export function withinSelfSurveyWindow(isoDate, from = todayLocal()) {
  if (!isoDate) return false;
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return false;
  const due = new Date(y, m - 1, d);
  const limit = new Date(from);
  limit.setDate(limit.getDate() + SELF_SURVEY_WINDOW_DAYS);
  return due <= limit;
}

export function trackingPath(token) {
  return `/track/${token}`;
}

// Client-facing stage names. The internal labels ("Estimating / Survey
// Booked", "With Client") are written for the team; these say the same thing
// to the person waiting on the work. Keys match lib/projectStatus.js.
export const CLIENT_STAGES = [
  { key: 'new', label: 'Request received', blurb: "We've got your request and will be in touch shortly." },
  { key: 'estimating', label: 'Surveying & quoting', blurb: 'We are surveying the site and putting together your quote.' },
  { key: 'designs', label: 'Design', blurb: 'Your content and layout are being designed.' },
  { key: 'install_booked', label: 'Installation booked', blurb: 'Your installation is booked in.' },
  { key: 'complete', label: 'Complete', blurb: 'This job is complete. Thank you!' },
];

// Statuses that sit outside the forward path. Shown as a note, not a step —
// "with client" can happen at any point, so it has no place on the line.
const OFF_PATH = {
  with_client: { label: 'Waiting on you', blurb: 'We need something from you to move forward — check below, or look out for an email from us.' },
  on_hold: { label: 'On hold', blurb: 'This job is currently on hold. Your Linney contact will be in touch.' },
  cancelled: { label: 'Cancelled', blurb: 'This job has been cancelled.' },
};

export function clientStage(status) {
  const idx = CLIENT_STAGES.findIndex((s) => s.key === status);
  if (idx !== -1) return { index: idx, ...CLIENT_STAGES[idx], offPath: false };
  if (OFF_PATH[status]) return { index: -1, key: status, ...OFF_PATH[status], offPath: true };
  return { index: 0, ...CLIENT_STAGES[0], offPath: false };
}
