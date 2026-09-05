// Shared header for the two project views. Carries the current filters across
// when you switch, so flipping from List to Board doesn't silently widen what
// you're looking at.
export function ProjectViewTabs({ current, params }) {
  const carried = new URLSearchParams();
  ['q', 'client', 'status', 'owner', 'archived'].forEach((k) => {
    if (params?.[k]) carried.set(k, params[k]);
  });
  const qs = carried.toString();
  const suffix = qs ? `?${qs}` : '';

  return (
    <div className="view-tabs">
      <a className={current === 'list' ? 'on' : ''} href={`/projects${suffix}`}>List</a>
      <a className={current === 'board' ? 'on' : ''} href={`/projects/board${suffix}`}>Board</a>
    </div>
  );
}
