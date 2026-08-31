export const PAGE_SIZE = 25;

// dateColumn differs between the two record types (survey_date vs install_date),
// so each sort option names its column indirectly.
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

export function parsePage(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
