// Date-only columns (survey_date, install_date) are plain 'YYYY-MM-DD' strings.
// Parsed deliberately by string rather than via new Date(): passing a date-only
// string to the Date constructor treats it as UTC midnight, which can display
// as the previous day in any timezone behind UTC.
export function formatDate(value) {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return String(value);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// submitted_at is a real timestamp, so local-time conversion is correct here.
export function formatDateTime(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
