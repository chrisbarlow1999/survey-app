// Screens in the pipeline, worked out one way so every page agrees.
//
// screen_count is null when nobody has estimated a project yet, which is not
// the same as a project with no screens. Summing with `|| 0` would blur the
// two and quietly under-report the pipeline, so the unestimated projects are
// counted separately and shown alongside the total.

export function screenTotals(projects) {
  let total = 0;
  let estimated = 0;
  let unestimated = 0;
  for (const p of projects || []) {
    if (p.screen_count == null) unestimated += 1;
    else {
      total += Number(p.screen_count) || 0;
      estimated += 1;
    }
  }
  return { total, estimated, unestimated };
}

// Screens per status, in board order, skipping stages with nothing in them —
// a table of zeroes is harder to read than a short list.
export function screensByStatus(projects, statuses) {
  const tally = {};
  for (const p of projects || []) {
    const e = tally[p.status] || { projects: 0, screens: 0, unestimated: 0 };
    e.projects += 1;
    if (p.screen_count == null) e.unestimated += 1;
    else e.screens += Number(p.screen_count) || 0;
    tally[p.status] = e;
  }
  return statuses
    .filter((s) => tally[s.key])
    .map((s) => ({ key: s.key, label: s.label, tone: s.tone, ...tally[s.key] }));
}

// "12 screens" / "1 screen" / "—" when it hasn't been estimated.
export function screenLabel(n) {
  if (n == null) return '—';
  return `${n} screen${Number(n) === 1 ? '' : 's'}`;
}
