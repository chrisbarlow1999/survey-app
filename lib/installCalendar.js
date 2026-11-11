import { ENGINEER_COMPANIES } from './engineerCompanies';

// Grouping and date maths for the install calendar.
//
// Everything works on plain 'YYYY-MM-DD' strings built with Date.UTC, the same
// rule as lib/scheduleWeeks.js: install_date is a Postgres `date` with no time
// or zone, and running it through the local-time Date constructor is how a
// Monday install quietly lands on the Sunday for anyone west of UTC.

const DAY = 86400000;

function toUtc(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function toIso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// A project with no firm booked yet still has to appear somewhere — it's the
// work that most needs attention, not work to hide.
export const UNASSIGNED = 'Unassigned';

export function companyOf(project) {
  return (project?.install_company || '').trim() || UNASSIGNED;
}

// The rows of the calendar. The known firms always appear, even on a quiet
// week, so the shape of the grid doesn't change as you page through. Anything
// typed under "Other" appears too, but only when it's actually booked, and
// Unassigned sits last because it's a gap rather than a team.
export function lanesFor(projects) {
  const extra = new Set();
  for (const p of projects || []) {
    const name = companyOf(p);
    if (name !== UNASSIGNED && !ENGINEER_COMPANIES.includes(name)) extra.add(name);
  }
  return [...ENGINEER_COMPANIES, ...[...extra].sort(), UNASSIGNED];
}

// Timed jobs first, in clock order, then all-day ones. A job with no time
// hasn't been slotted yet, so it reads as "also this day" rather than
// pretending to be first thing.
export function sortForDay(a, b) {
  const at = a.install_start_time || '';
  const bt = b.install_start_time || '';
  if (at && bt) return at.localeCompare(bt);
  if (at) return -1;
  if (bt) return 1;
  return (a.title || '').localeCompare(b.title || '');
}

// Postgres hands back 'HH:MM:SS'; nobody schedules to the second.
function hhmm(t) {
  return typeof t === 'string' && t.length >= 5 ? t.slice(0, 5) : null;
}

export function formatTimeRange(start, end) {
  const s = hhmm(start);
  const e = hhmm(end);
  if (!s) return 'All day';
  return e ? `${s}–${e}` : s;
}

// { '2026-11-12': { SCCI: [p, p], Unassigned: [p] } }
export function bucketByDayAndCompany(projects) {
  const byDay = new Map();
  for (const p of projects || []) {
    if (!p.install_date) continue;
    const day = byDay.get(p.install_date) || new Map();
    const name = companyOf(p);
    const list = day.get(name) || [];
    list.push(p);
    day.set(name, list);
    byDay.set(p.install_date, day);
  }
  for (const day of byDay.values()) {
    for (const list of day.values()) list.sort(sortForDay);
  }
  return byDay;
}

export function countsForDay(byDay, iso) {
  const day = byDay.get(iso);
  if (!day) return { total: 0, byCompany: [] };
  let total = 0;
  const byCompany = [];
  for (const [name, list] of day) {
    total += list.length;
    byCompany.push({ name, count: list.length });
  }
  // Busiest firm first — on a crowded day that's the one worth looking at.
  byCompany.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { total, byCompany };
}

// ---------- week ----------

export function startOfWeek(iso) {
  const ms = toUtc(iso);
  const dow = new Date(ms).getUTCDay(); // 0 = Sunday
  // Weeks start Monday: install crews work Monday–Friday, and a Sunday-start
  // week splits a working week across two screens.
  return toIso(ms - (dow === 0 ? 6 : dow - 1) * DAY);
}

export function addDays(iso, n) {
  return toIso(toUtc(iso) + n * DAY);
}

export function weekDays(startIso) {
  return Array.from({ length: 7 }, (_, i) => addDays(startIso, i));
}

// ---------- month ----------

export function startOfMonth(iso) {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonths(iso, n) {
  const [y, m] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

// Whole weeks covering the month, so every row is seven cells and the grid
// never goes ragged. Days from the neighbouring months are included and
// flagged, the way a wall calendar shows them greyed.
export function buildMonthGrid(anchorIso) {
  const monthStart = startOfMonth(anchorIso);
  const monthKey = monthStart.slice(0, 7);
  const nextMonth = addMonths(monthStart, 1);
  const gridStart = startOfWeek(monthStart);

  const weeks = [];
  let cursor = gridStart;
  // A month spans at most six weeks; stop as soon as a whole week has passed
  // the end of it rather than always drawing six.
  while (cursor < nextMonth || weeks.length === 0) {
    weeks.push(weekDays(cursor).map((d) => ({ iso: d, inMonth: d.slice(0, 7) === monthKey })));
    cursor = addDays(cursor, 7);
    if (weeks.length >= 6) break;
  }
  return { monthStart, monthKey, gridStart, gridEnd: cursor, weeks };
}

export function monthLabel(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`;
}

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
