// Shared, browser-safe helpers for the Menus section. No database access here:
// everything takes rows already loaded and returns plain data.

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// A product is the same product if its section, name and detail line match.
// Detail is part of the identity on purpose — see menu_products in 037.
export function productKey(sectionName, name, detail) {
  return [norm(sectionName), norm(name), norm(detail)].join('|');
}

export function outletKey(name) {
  return norm(name);
}

// The master schedule and the client's sheet name kiosks differently:
// "EK12 -AWAY (EK12)" against "EK12", "NKD52 Cadburys" against "NKD52
// Chocolate Shop". Try the exact name, then the name without its bracketed
// alias, then the leading code — and give up rather than guess when the code
// is ambiguous ("NK81" and "NK81 Betfred" are different outlets).
export function matchOutlet(outlets, kiosk) {
  const byName = new Map(outlets.map((o) => [norm(o.name), o]));
  const exact = byName.get(norm(kiosk));
  if (exact) return exact;

  const unbracketed = byName.get(norm(kiosk.replace(/\(.*?\)/g, '')));
  if (unbracketed) return unbracketed;

  const code = kiosk.trim().split(/[\s(]/)[0].toUpperCase();
  if (!code) return null;
  const sameName = outlets.filter((o) => o.name.trim().toUpperCase() === code);
  if (sameName.length === 1) return sameName[0];
  const sameCode = outlets.filter((o) => o.name.trim().split(/[\s(]/)[0].toUpperCase() === code);
  return sameCode.length === 1 ? sameCode[0] : null;
}

// "1 (Portrait Screen)" → portrait 1; "4" → landscape 4, since the sheet only
// calls out portrait; "N/A" → none. Anything unreadable is unknown (null), not
// zero — zero means the outlet genuinely has no screens.
export function parseClientScreens(raw) {
  const s = (raw || '').trim();
  if (!s) return { landscape: null, portrait: null };
  if (/^n\/?a$/i.test(s)) return { landscape: 0, portrait: 0 };
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return { landscape: null, portrait: null };
  return /portrait/i.test(s) ? { landscape: 0, portrait: n } : { landscape: n, portrait: 0 };
}

export function screenLabel(o) {
  const l = o.landscape_screens;
  const p = o.portrait_screens;
  if (l == null && p == null) return 'Screens unknown';
  if (!l && !p) return 'No screens';
  const parts = [];
  if (l) parts.push(`${l} landscape`);
  if (p) parts.push(`${p} portrait`);
  return parts.join(' + ');
}

export function hasScreens(o) {
  return Boolean(o.landscape_screens) || Boolean(o.portrait_screens);
}

// The client sheet's count only says how many, not which way round, so it's
// compared on the total alone.
export function screensDisagree(o) {
  const raw = (o.client_screens || '').trim();
  if (!raw || (o.landscape_screens == null && o.portrait_screens == null)) return false;
  const clientTotal = /^n\/?a$/i.test(raw) ? 0 : parseInt(raw, 10);
  if (Number.isNaN(clientTotal)) return false;
  return clientTotal !== (o.landscape_screens || 0) + (o.portrait_screens || 0);
}

export const rangeKey = (outletId, productId) => `${outletId}:${productId}`;

// Outlets that sell exactly the same products under one menu set, split again
// by screen layout — a schedule plays to a fixed set of screens, so outlets
// can only share one if both their range and their screens match.
//
// Returns groups largest first. Each carries the schedules its members are on
// today, which is what makes a disagreement visible: one range spread across
// several schedules may be a merge nobody made; one schedule across several
// ranges is showing someone the wrong menu.
export function groupOutlets(outlets, products, ticked) {
  const productIds = products.map((p) => p.id);
  const byRange = new Map();

  for (const o of outlets) {
    if (!hasScreens(o)) continue;
    const sold = productIds.filter((pid) => ticked.has(rangeKey(o.id, pid)));
    const rangeFp = sold.join(',');
    const layoutFp = `${o.landscape_screens ?? '?'}L${o.portrait_screens ?? '?'}P`;
    const fp = `${rangeFp}#${layoutFp}`;
    if (!byRange.has(fp)) byRange.set(fp, { rangeFp, layoutFp, sold, outlets: [] });
    byRange.get(fp).outlets.push(o);
  }

  const groups = [...byRange.values()];
  const rangeCounts = new Map();
  for (const g of groups) rangeCounts.set(g.rangeFp, (rangeCounts.get(g.rangeFp) || 0) + 1);

  // Which ranges does each current schedule cover?
  const scheduleRanges = new Map();
  for (const g of groups) {
    for (const o of g.outlets) {
      const s = baseSchedule(o.current_schedule);
      if (!s) continue;
      if (!scheduleRanges.has(s)) scheduleRanges.set(s, new Set());
      scheduleRanges.get(s).add(g.rangeFp);
    }
  }

  return groups
    .map((g) => {
      const schedules = [...new Set(g.outlets.map((o) => o.current_schedule).filter(Boolean))];
      const mixedSchedules = [...new Set(g.outlets.map((o) => baseSchedule(o.current_schedule)).filter(Boolean))]
        .filter((s) => scheduleRanges.get(s)?.size > 1);
      return {
        ...g,
        schedules,
        unscheduled: g.outlets.filter((o) => !o.current_schedule),
        splitAcrossSchedules: new Set(g.outlets.map((o) => baseSchedule(o.current_schedule)).filter(Boolean)).size > 1,
        sharedWithOtherRanges: mixedSchedules,
        sameRangeOtherLayouts: rangeCounts.get(g.rangeFp) - 1,
      };
    })
    .sort((a, b) => b.outlets.length - a.outlets.length || b.sold.length - a.sold.length);
}

// "SCHEDULE 12 W DIRECTIONAL" is Schedule 12 plus wayfinding content, so for
// "is this one schedule" purposes it's compared as written. Only whitespace
// and case are normalised; a suffix like "A" is a real, separate schedule.
export function baseSchedule(s) {
  return (s || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

// Product ids ticked in one set but not the other, per outlet.
export function diffSets(outlets, products, tickedA, tickedB) {
  const rows = [];
  for (const o of outlets) {
    const added = [];
    const removed = [];
    for (const p of products) {
      const a = tickedA.has(rangeKey(o.id, p.id));
      const b = tickedB.has(rangeKey(o.id, p.id));
      if (a && !b) removed.push(p);
      if (!a && b) added.push(p);
    }
    if (added.length || removed.length) rows.push({ outlet: o, added, removed });
  }
  return rows;
}
