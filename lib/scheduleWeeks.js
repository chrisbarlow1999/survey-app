// Week bucketing for the install schedule.
//
// Everything here works on plain 'YYYY-MM-DD' strings and builds dates with
// Date.UTC. install_date is a Postgres `date` — no time, no zone — and running
// it through the local-time Date constructor is how an install booked for a
// Monday quietly lands in the previous week for anyone west of UTC.

const DAY = 86400000;

function toUtc(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function toIso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Monday of the week containing `iso`. Weeks start Monday because install
// crews work Monday–Friday; a Sunday-start week splits a working week in two.
export function startOfWeek(iso) {
  const ms = toUtc(iso);
  const dow = new Date(ms).getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  return toIso(ms - back * DAY);
}

export function addWeeks(iso, n) {
  return toIso(toUtc(iso) + n * 7 * DAY);
}

// The window of weeks to render: [{ key, start, end }], end inclusive.
export function buildWeeks(startIso, count) {
  const weeks = [];
  for (let i = 0; i < count; i += 1) {
    const start = addWeeks(startIso, i);
    weeks.push({ key: start, start, end: toIso(toUtc(start) + 6 * DAY) });
  }
  return weeks;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
