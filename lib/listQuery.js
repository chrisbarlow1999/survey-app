export const PAGE_SIZE = 25;

// dateColumn differs between the record types (survey_date / install_date /
// visit_date), so each sort option names its column indirectly.
export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first', column: 'submitted_at', ascending: false },
  { value: 'oldest', label: 'Oldest first', column: 'submitted_at', ascending: true },
  { value: 'date_desc', label: 'Site date (newest)', column: '__date', ascending: false },
  { value: 'date_asc', label: 'Site date (oldest)', column: '__date', ascending: true },
  { value: 'site_az', label: 'Site name (A–Z)', column: 'site_location', ascending: true },
  { value: 'site_za', label: 'Site name (Z–A)', column: 'site_location', ascending: false },
];

export function resolveSort(sortValue, dateColumn) {
  const option = SORT_OPTIONS.find((o) => o.value === sortValue) || SORT_OPTIONS[0];
  return {
    value: option.value,
    column: option.column === '__date' ? dateColumn : option.column,
    ascending: option.ascending,
  };
}

// Projects sort on their own columns — they have a title rather than a site
// name, a due date rather than a date of attendance, and created_at rather
// than submitted_at.
export const PROJECT_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first', column: 'created_at', ascending: false },
  { value: 'oldest', label: 'Oldest first', column: 'created_at', ascending: true },
  { value: 'due_asc', label: 'Due date (soonest)', column: 'due_date', ascending: true },
  { value: 'due_desc', label: 'Due date (latest)', column: 'due_date', ascending: false },
  { value: 'title_az', label: 'Title (A–Z)', column: 'title', ascending: true },
  { value: 'title_za', label: 'Title (Z–A)', column: 'title', ascending: false },
];

export function resolveProjectSort(sortValue) {
  const option = PROJECT_SORT_OPTIONS.find((o) => o.value === sortValue) || PROJECT_SORT_OPTIONS[0];
  // Undated projects sort to the bottom either way — one with no due date is
  // not the most urgent thing on the list.
  return { value: option.value, column: option.column, ascending: option.ascending, nullsFirst: false };
}

export function parsePage(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
