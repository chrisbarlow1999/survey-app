import { SCREEN_SIZES } from './screenSizes';
import { normalizeSiteName } from './siteName';

// Turns linked surveys into the two things the pipeline reports need: what
// hardware a job actually calls for, and what it will take to fit it.
//
// Both are drawn from surveys rather than from the project itself, because a
// project only carries a forecast total. The size, the model and the resourcing
// estimate only exist once an engineer has been on site.

// One entry per physical screen across every survey passed in.
export function screensFromSurveys(surveys) {
  const out = [];
  for (const s of surveys || []) {
    for (const area of s.locations || []) {
      const size = area.screen_size || 'unknown';
      // An area written before multi-screen input has no screens array; it was
      // one screen. Treating it as zero would silently shrink the history.
      const n = Array.isArray(area.screens) ? area.screens.length : 1;
      for (let i = 0; i < n; i += 1) {
        out.push({
          size,
          label: SCREEN_SIZES[size]?.label || 'Not specified',
          model: SCREEN_SIZES[size]?.model || '—',
          mount: area.mount_type === 'Other' ? (area.mount_type_other || 'Other') : (area.mount_type || null),
          projectId: s.project_id || null,
          surveyId: s.id,
        });
      }
    }
  }
  return out;
}

// Grouped by screen size, biggest count first, ready to render.
export function screenMix(screens) {
  const tally = {};
  for (const s of screens) {
    const e = tally[s.size] || { size: s.size, label: s.label, model: s.model, count: 0, projects: new Set() };
    e.count += 1;
    if (s.projectId) e.projects.add(s.projectId);
    tally[s.size] = e;
  }
  return Object.values(tally)
    .map((e) => ({ ...e, projects: e.projects.size }))
    .sort((a, b) => b.count - a.count);
}

export function mountMix(screens) {
  const tally = {};
  for (const s of screens) {
    const key = s.mount || 'Not specified';
    tally[key] = (tally[key] || 0) + 1;
  }
  return Object.entries(tally)
    .map(([mount, count]) => ({ mount, count }))
    .sort((a, b) => b.count - a.count);
}

// Engineer-days = days on site × engineers needed. Only counted where the
// survey gives both: multiplying by a missing engineer count would invent a
// number, so those surveys are reported as incomplete instead of assumed to
// be one person.
export function engineerDays(surveys) {
  let total = 0;
  let incomplete = 0;
  for (const s of surveys || []) {
    const days = Number(s.engineer_days);
    const crew = Number(s.engineer_count);
    if (days > 0 && crew > 0) total += days * crew;
    else incomplete += 1;
  }
  return { total, incomplete };
}

// Which linked surveys count toward the screen figures, and why.
//
// A site that gets re-surveyed — the client asks for changes, an engineer goes
// back — ends up with two surveys. Both stay on record, but only the newer one
// describes what's actually going in, so counting both would double the
// hardware. That's the automatic rule.
//
// It's keyed on project AND site, not project alone: a rollout can carry a
// survey per venue, and collapsing those to one survey per project would
// silently drop every site but the most recent. A survey with no site name is
// never collapsed with anything — without a name there's no evidence two
// surveys describe the same place, and wrongly dropping one loses real screens.
//
// The rule still can't tell a re-survey from a site surveyed in phases (ground
// floor in January, first floor in March, same site name on both). Nothing in
// the data distinguishes them, so surveys.counts_in_totals lets a PM say which
// it is — see migration 031. Explicit choices stand on their own; the automatic
// rule then runs only among the surveys still left on auto, so including an
// older survey by hand doesn't knock the newer one out.
export const INCLUSION_REASON = {
  forced_in: 'Counted — set by hand',
  forced_out: 'Not counted — set by hand',
  only: 'Only survey for this site',
  latest: 'Latest survey for this site',
  superseded: 'Superseded by a later survey for this site',
};

function groupKey(s) {
  const site = normalizeSiteName(s.site_location);
  return site ? `${s.project_id || 'none'}::${site}` : `unnamed::${s.id}`;
}

export function surveyInclusion(surveys) {
  const list = surveys || [];

  // Only surveys left on auto compete for "latest".
  const groups = new Map();
  for (const s of list) {
    if (s.counts_in_totals === true || s.counts_in_totals === false) continue;
    const key = groupKey(s);
    const arr = groups.get(key) || [];
    arr.push(s);
    groups.set(key, arr);
  }

  const winners = new Map();
  for (const [key, arr] of groups) {
    let best = arr[0];
    for (const s of arr) if (isNewer(s, best)) best = s;
    winners.set(key, { id: best.id, size: arr.length });
  }

  // How many surveys exist for each site in total, explicit ones included. Used
  // only for wording: calling a survey the "only" one for its site while a
  // hand-counted sibling sits directly beneath it reads like a contradiction.
  const siteTotals = new Map();
  for (const s of list) {
    const key = groupKey(s);
    siteTotals.set(key, (siteTotals.get(key) || 0) + 1);
  }

  const entries = list.map((s) => {
    if (s.counts_in_totals === true) return { survey: s, counted: true, reason: 'forced_in' };
    if (s.counts_in_totals === false) return { survey: s, counted: false, reason: 'forced_out' };
    const key = groupKey(s);
    const w = winners.get(key);
    if (w && w.id === s.id) {
      return { survey: s, counted: true, reason: siteTotals.get(key) > 1 ? 'latest' : 'only' };
    }
    return { survey: s, counted: false, reason: 'superseded' };
  });

  return {
    entries,
    kept: entries.filter((e) => e.counted).map((e) => e.survey),
    superseded: entries.filter((e) => e.reason === 'superseded').length,
    excluded: entries.filter((e) => e.reason === 'forced_out').length,
  };
}

// survey_date first: it's when an engineer actually stood on the site, which is
// what "latest" means here. submitted_at breaks ties, including a re-survey
// recorded for the same day as the original.
function isNewer(a, b) {
  const ad = a.survey_date || '';
  const bd = b.survey_date || '';
  if (ad !== bd) return ad > bd;
  return (a.submitted_at || '') > (b.submitted_at || '');
}

// Screens on one survey, for showing a per-survey figure next to the toggle.
export function screenCountOf(survey) {
  return (survey.locations || []).reduce(
    (n, a) => n + (Array.isArray(a.screens) ? a.screens.length : 1),
    0
  );
}
