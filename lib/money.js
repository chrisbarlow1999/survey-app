// Pipeline value, worked out one way so every page agrees.
//
// Mirrors lib/screenCount.js deliberately: value_gbp is null when nobody has
// quoted a project, which is not the same as a job worth nothing. Summing with
// `|| 0` would blur the two and under-report the pipeline, so unquoted projects
// are counted separately and reported alongside the total.
//
// PostgREST hands back `numeric` as a JSON number, but a value that came from a
// form is a string until it's written. Number() on the way in keeps the totals
// arithmetic rather than accidental string concatenation.

export function valueTotals(projects) {
  let total = 0;
  let quoted = 0;
  let unquoted = 0;
  for (const p of projects || []) {
    if (p.value_gbp == null || p.value_gbp === '') unquoted += 1;
    else {
      total += Number(p.value_gbp) || 0;
      quoted += 1;
    }
  }
  return { total, quoted, unquoted };
}

// Value per status, in board order, skipping stages with nothing in them.
export function valueByStatus(projects, statuses) {
  const tally = {};
  for (const p of projects || []) {
    const e = tally[p.status] || { value: 0, quoted: 0, unquoted: 0 };
    if (p.value_gbp == null || p.value_gbp === '') e.unquoted += 1;
    else {
      e.value += Number(p.value_gbp) || 0;
      e.quoted += 1;
    }
    tally[p.status] = e;
  }
  return statuses.filter((s) => tally[s.key]).map((s) => ({ key: s.key, ...tally[s.key] }));
}

// Whole pounds everywhere. Pipeline figures are read at a glance and compared
// between stages — pence add width and no information.
const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

export function formatGBP(n) {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return GBP.format(num);
}

// Headline totals get k / m so a stat tile doesn't wrap mid-number. Exact
// figures still show in full on the rows underneath.
export function formatGBPShort(n) {
  const num = Number(n) || 0;
  if (num >= 1000000) return `£${(num / 1000000).toFixed(num >= 10000000 ? 0 : 1)}m`;
  if (num >= 10000) return `£${Math.round(num / 1000)}k`;
  return GBP.format(num);
}
