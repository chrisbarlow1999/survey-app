// Keeps "← Back to Projects" honest about where you came from.
//
// The link used to be hardcoded to /projects, so opening a card from the Board
// and coming back dropped you on the List — and, on the List and Table, threw
// away whatever you'd filtered, sorted and paged to. Each project link now
// carries the view it was opened from, and the back link replays it.
//
// The return address is rebuilt from an allowlist rather than trusted as
// given. A `?back=` parameter is user-editable — anyone can paste anything into
// it — so treating it as a URL to follow would be a redirect someone else gets
// to choose. Only these three paths and these five query keys survive the trip;
// anything else is dropped and you land on /projects.

const VIEWS = ['/projects', '/projects/table', '/projects/board', '/projects/schedule', '/projects/screens'];
// `offset` is the schedule's window. Leave it out and coming back from a
// project lands you on this quarter rather than the one you were reading.
const CARRIED = ['q', 'client', 'status', 'owner', 'archived', 'sort', 'page', 'offset'];

// The URL to come back to, from a view's own path and its current params.
export function buildReturnHref(basePath, params) {
  const path = VIEWS.includes(basePath) ? basePath : '/projects';
  const sp = new URLSearchParams();
  CARRIED.forEach((k) => {
    if (params?.[k]) sp.set(k, String(params[k]));
  });
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

// Link to a project, remembering the view it was opened from.
export function projectHref(id, basePath, params) {
  const back = buildReturnHref(basePath, params);
  // No point carrying the default — it's what the back link falls back to.
  if (back === '/projects') return `/projects/${id}`;
  return `/projects/${id}?back=${encodeURIComponent(back)}`;
}

// Rebuild a safe return address from whatever arrived in ?back=. Never returns
// anything but one of VIEWS, optionally with known query keys.
export function parseReturnHref(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return '/projects';
  // A second leading slash would make this protocol-relative — //evil.com is a
  // different origin, not a path on this one.
  if (raw.startsWith('//')) return '/projects';
  let url;
  try {
    url = new URL(raw, 'http://local');
  } catch {
    return '/projects';
  }
  if (!VIEWS.includes(url.pathname)) return '/projects';
  const sp = new URLSearchParams();
  CARRIED.forEach((k) => {
    const v = url.searchParams.get(k);
    if (v) sp.set(k, v);
  });
  const qs = sp.toString();
  return qs ? `${url.pathname}?${qs}` : url.pathname;
}

// "Back to Board" reads better than "Back to Projects" when that's where you
// came from — it tells you where the link goes before you click it.
export function backLabel(href) {
  if (href.startsWith('/projects/board')) return 'Back to Board';
  if (href.startsWith('/projects/table')) return 'Back to Table';
  if (href.startsWith('/projects/schedule')) return 'Back to Schedule';
  if (href.startsWith('/projects/screens')) return 'Back to Screens';
  return 'Back to Projects';
}
