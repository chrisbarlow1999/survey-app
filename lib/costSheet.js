import { screenInfo } from './hardware';

// Cost sheet maths and seeding, in one place so the editor, the totals stored
// on the row and the client-facing page can never disagree about what a sheet
// comes to.
//
// A line looks like:
//   { description, unit, qty, unit_cost, unit_price }
// unit_cost is internal only — migration 036 strips it before the client's
// page ever sees a line. Nothing here should put a cost into a field with a
// different name, or that subtraction stops covering it.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function lineCost(item) {
  return num(item?.qty) * num(item?.unit_cost);
}

export function linePrice(item) {
  return num(item?.qty) * num(item?.unit_price);
}

// Margin is stated in money and as a percentage of the sell price, which is how
// it's usually quoted. A sheet that sells for nothing has no percentage rather
// than an infinite one.
export function sheetTotals(items) {
  const list = Array.isArray(items) ? items : [];
  const cost = list.reduce((n, i) => n + lineCost(i), 0);
  const price = list.reduce((n, i) => n + linePrice(i), 0);
  const margin = price - cost;
  return {
    cost,
    price,
    margin,
    marginPct: price > 0 ? (margin / price) * 100 : null,
    // Surfaced rather than silently treated as free: a line with no price is
    // the most likely mistake on a sheet built from a catalogue that starts
    // with no prices in it.
    unpriced: list.filter((i) => i.unit_price == null || i.unit_price === '').length,
  };
}

// The rate to use for one catalogue item and one client: a per-client override
// wins field by field, so a client can have their own sell price without
// restating our cost.
export function rateFor(item, clientRate) {
  return {
    cost: clientRate?.cost ?? item?.default_cost ?? null,
    price: clientRate?.price ?? item?.default_price ?? null,
  };
}

// Builds the opening lines of a sheet from a survey: one line per screen model,
// one per mount type, installation from the surveyor's estimated hours (see
// installationLines below), and a blank Delivery line.
//
// Quantities come from the survey, prices from the catalogue. Anything the
// catalogue has no entry for still gets a line — with a description and a
// quantity but no price — because a missing line is easy to miss and an
// unpriced one is not.
export function seedItemsFromSurvey(survey, catalogue = [], clientRates = [], hw = null) {
  const byKey = new Map(catalogue.filter((i) => i.match_key).map((i) => [i.match_key, i]));
  const rateByItem = new Map(clientRates.map((r) => [r.price_item_id, r]));

  const screenQty = new Map();
  const mountQty = new Map();

  for (const area of survey?.locations || []) {
    // An area written before multi-screen input has no screens array; it was
    // one screen. Same rule as lib/surveyScreens.js.
    const count = Array.isArray(area.screens) ? area.screens.length : 1;
    if (count <= 0) continue;

    const size = area.screen_size || 'unknown';
    screenQty.set(size, (screenQty.get(size) || 0) + count);

    const mount = area.mount_type === 'Other'
      ? (area.mount_type_other || 'Other')
      : (area.mount_type || null);
    if (mount) mountQty.set(mount, (mountQty.get(mount) || 0) + count);
  }

  const lines = [];

  // `blank` leaves the price empty whatever the catalogue says — for lines that
  // are priced per job by hand.
  function push(matchKey, fallbackDescription, unit, qty, { blank = false } = {}) {
    const item = byKey.get(matchKey);
    const rate = item && !blank ? rateFor(item, rateByItem.get(item.id)) : { cost: null, price: null };
    lines.push({
      description: item?.name || fallbackDescription,
      unit: item?.unit || unit,
      qty,
      unit_cost: rate.cost,
      unit_price: rate.price,
      match_key: matchKey,
    });
  }

  for (const [size, qty] of screenQty) {
    const info = screenInfo(hw, size);
    const label = info?.model || info?.label || 'Screen (size not specified)';
    push(`screen:${size}`, label, 'each', qty);
  }
  for (const [mount, qty] of mountQty) {
    push(`mount:${mount}`, mount, 'each', qty);
  }

  for (const l of installationLines(survey?.engineer_hours)) {
    push(l.key, l.description, l.unit, l.qty);
  }

  // Delivery is costed per project (it depends on the job's size), so every
  // sheet starts with the line in place and the price left for the PM.
  push('delivery', 'Delivery', 'each', 1, { blank: true });

  return lines;
}

// Installation, priced the way the internal cost sheet does it — rates for a
// two-engineer crew, from the survey's estimated hours on site:
//   under a full day  → "first hour on site" + "any hour thereafter" × the rest
//   a full day or more → the day rate × whole days, + "any hour thereafter" for
//                        any hours left over
// The first hour is deliberately priced below cost; the hours after it carry
// the margin. No hours estimated → no installation lines (the PM adds them).
export const INSTALL_DAY_HOURS = 7.5;

export function installationLines(hoursOnSite) {
  const hours = Number(hoursOnSite);
  if (!(hours > 0)) return [];
  const round = (n) => Math.round(n * 100) / 100;
  const days = Math.floor(hours / INSTALL_DAY_HOURS);
  const out = [];
  if (days >= 1) {
    out.push({ key: 'install_day', description: 'Installation - 1 full working day, 9am to 5pm, 2 engineers', unit: 'day', qty: days });
    const rest = round(hours - days * INSTALL_DAY_HOURS);
    if (rest > 0) out.push({ key: 'install_extra_hour', description: 'Installation - 2 engineers, any hour thereafter', unit: 'hour', qty: rest });
  } else {
    out.push({ key: 'install_first_hour', description: 'Installation - 2 engineers, first hour on site', unit: 'hour', qty: 1 });
    const rest = round(hours - 1);
    if (rest > 0) out.push({ key: 'install_extra_hour', description: 'Installation - 2 engineers, any hour thereafter', unit: 'hour', qty: rest });
  }
  return out;
}

// Internal note for a sheet seeded from a survey: the installation rates are
// for two engineers, so flag a survey that asks for a different crew.
export function seedNotesFromSurvey(survey) {
  const crew = Number(survey?.engineer_count);
  const hours = Number(survey?.engineer_hours);
  const notes = [];
  if (hours > 0 && crew > 0 && crew !== 2) {
    notes.push(`The survey says ${crew} engineer${crew === 1 ? '' : 's'} for ${hours} hour${hours === 1 ? '' : 's'}; the installation lines use the 2-engineer rates — check them.`);
  }
  if (!(hours > 0)) {
    notes.push('The survey has no estimated hours, so no installation lines were added.');
  }
  return notes.length ? notes.join('\n') : null;
}
