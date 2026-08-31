// Three-way archive filter for the list pages. Radio-backed rather than a
// checkbox so "show both" is possible, and so it renders inside the plain GET
// filter form with no client-side state.
const OPTIONS = [
  { value: '', label: 'Active' },
  { value: '1', label: 'Archived' },
  { value: 'all', label: 'All' },
];

export function ArchiveFilter({ value }) {
  const current = OPTIONS.some((o) => o.value === value) ? value : '';
  return (
    <div className="segmented segmented-radio" role="group" aria-label="Archive status">
      {OPTIONS.map((o) => (
        <label key={o.value || 'active'}>
          <input type="radio" name="archived" value={o.value} defaultChecked={current === o.value} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

// Applies the filter to a Supabase query. Kept next to the control so the
// option values and their meaning can't drift apart.
export function applyArchiveFilter(query, value) {
  if (value === 'all') return query;
  if (value === '1') return query.not('archived_at', 'is', null);
  return query.is('archived_at', null);
}
