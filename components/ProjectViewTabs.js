// Shared header for the project views. Carries the current filters across when
// you switch, so flipping from List to Table doesn't silently widen what you're
// looking at. Sort is carried too — it means something on List and Table, and
// is simply ignored by the Board, which orders by column.
export function ProjectViewTabs({ current, params }) {
  const carried = new URLSearchParams();
  ['q', 'client', 'status', 'owner', 'archived', 'sort'].forEach((k) => {
    if (params?.[k]) carried.set(k, params[k]);
  });
  const qs = carried.toString();
  const suffix = qs ? `?${qs}` : '';

  return (
    <div className="view-tabs">
      <a className={current === 'list' ? 'on' : ''} href={`/projects${suffix}`}>List</a>
      <a className={current === 'table' ? 'on' : ''} href={`/projects/table${suffix}`}>Table</a>
      <a className={current === 'board' ? 'on' : ''} href={`/projects/board${suffix}`}>Board</a>
      <a className={current === 'schedule' ? 'on' : ''} href={`/projects/schedule${suffix}`}>Schedule</a>
      <a className={current === 'screens' ? 'on' : ''} href={`/projects/screens${suffix}`}>Screens</a>
    </div>
  );
}
