import { SCREEN_SIZES } from './screenSizes';

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
// one per mount type, and the engineer days the surveyor estimated.
//
// Quantities come from the survey, prices from the catalogue. Anything the
// catalogue has no entry for still gets a line — with a description and a
// quantity but no price — because a missing line is easy to miss and an
// unpriced one is not.
export function seedItemsFromSurvey(survey, catalogue = [], clientRates = []) {
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

  function push(matchKey, fallbackDescription, unit, qty) {
    const item = byKey.get(matchKey);
    const rate = item ? rateFor(item, rateByItem.get(item.id)) : { cost: null, price: null };
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
    const label = SCREEN_SIZES[size]?.model || SCREEN_SIZES[size]?.label || 'Screen (size not specified)';
    push(`screen:${size}`, label, 'each', qty);
  }
  for (const [mount, qty] of mountQty) {
    push(`mount:${mount}`, mount, 'each', qty);
  }

  // days × engineers, the same figure the schedule totals. Only when the
  // surveyor gave both — multiplying by a missing crew size would invent a
  // number.
  const days = Number(survey?.engineer_days);
  const crew = Number(survey?.engineer_count);
  if (days > 0 && crew > 0) {
    push('engineer_day', 'Engineer day', 'day', days * crew);
  }

  return lines;
}
