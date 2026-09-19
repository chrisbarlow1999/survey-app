// What a change request asks for, and what it would affect. Pure: the request
// screen, the saved request and the brief all read the same functions, so the
// panel you see while typing and the brief the studio reads can't disagree.

import { rangeKey, baseSchedule } from './menus';

// A draft is what the screen holds:
//   outletIds  the outlets being changed (a Set of ids)
//   prices     { [productId]: 'new price' }         — prices are estate-wide
//   toggles    { [productId]: true | false }        — on or off at those outlets
//   newItems   [{ tempId, name, section, detail, price }] — not on the menu yet
//
// `ticked` is the saved set of "outlet sells product" keys for the menu set
// being changed, as rangeKey() builds them.
export function draftItems({ products, draft, ticked }) {
  const items = [];
  const outletIds = [...draft.outletIds];

  for (const p of products) {
    const wanted = draft.prices[p.id];
    if (wanted != null && wanted.trim() !== (p.price || '').trim()) {
      const sold = countSelling(p, ticked);
      items.push({
        kind: 'price',
        product_id: p.id,
        product_label: p.name,
        detail: p.detail || null,
        from_price: p.price || null,
        to_price: wanted.trim(),
        outlet_ids: [],
        soldAt: sold,
      });
    }

    const toggle = draft.toggles[p.id];
    if (toggle === undefined || !outletIds.length) continue;
    const changing = outletIds.filter((id) => ticked.has(rangeKey(id, p.id)) !== toggle);
    if (!changing.length) continue;
    items.push({
      kind: toggle ? 'add' : 'remove',
      product_id: p.id,
      product_label: p.name,
      detail: p.detail || null,
      from_price: null,
      to_price: null,
      outlet_ids: changing,
    });
  }

  for (const n of draft.newItems || []) {
    if (!n.name.trim() || !outletIds.length) continue;
    items.push({
      kind: 'new_product',
      product_id: null,
      product_label: n.name.trim(),
      section_name: (n.section || '').trim() || 'UNSORTED',
      detail: n.detail?.trim() || null,
      from_price: null,
      to_price: n.price?.trim() || null,
      outlet_ids: outletIds,
    });
  }

  return items;
}

function countSelling(product, ticked) {
  let n = 0;
  for (const k of ticked) if (k.endsWith(`:${product.id}`)) n++;
  return n;
}

// Everything the request touches, and — the part done by eye today — the
// schedules it would break apart.
//
// Outlets that share a schedule show the same content. If a change lands on
// some of them but not the others, and they agreed on that product before,
// somebody has to decide: change them all, or split the schedule. That's a
// conflict, and it's raised while the request is being typed rather than
// found later.
export function changeImpact({ outlets, products, ticked, items }) {
  const byId = new Map(outlets.map((o) => [o.id, o]));
  const productById = new Map(products.map((p) => [p.id, p]));

  const touched = new Set();
  for (const item of items) {
    for (const id of item.outlet_ids) touched.add(id);
    // A price is the same everywhere it's sold, so it touches every outlet
    // that sells it.
    if (item.kind === 'price' && item.product_id) {
      for (const o of outlets) if (ticked.has(rangeKey(o.id, item.product_id))) touched.add(o.id);
    }
  }

  const schedules = new Map();
  for (const o of outlets) {
    const s = baseSchedule(o.current_schedule);
    if (!s) continue;
    if (!schedules.has(s)) schedules.set(s, []);
    schedules.get(s).push(o);
  }

  const conflicts = [];
  for (const [schedule, members] of schedules) {
    if (members.length < 2) continue;
    const changed = [];
    for (const item of items) {
      if (item.kind === 'price' || !item.product_id && item.kind !== 'new_product') continue;
      const inItem = new Set(item.outlet_ids);
      const hits = members.filter((o) => inItem.has(o.id));
      if (!hits.length || hits.length === members.length) continue;

      const sells = (o) => (item.kind === 'add' || item.kind === 'new_product'
        ? inItem.has(o.id) || (item.product_id ? ticked.has(rangeKey(o.id, item.product_id)) : false)
        : !inItem.has(o.id) && ticked.has(rangeKey(o.id, item.product_id)));
      const after = members.map(sells);
      const before = members.map((o) => (item.product_id ? ticked.has(rangeKey(o.id, item.product_id)) : false));
      const mixed = (list) => list.some(Boolean) && !list.every(Boolean);
      if (mixed(after) && !mixed(before)) {
        changed.push({
          label: item.product_label,
          kind: item.kind,
          inChange: members.filter((o) => inItem.has(o.id)),
          others: members.filter((o) => !inItem.has(o.id)),
        });
      }
    }
    if (changed.length) conflicts.push({ schedule, members, items: changed });
  }

  const touchedSchedules = [...new Set(
    [...touched].map((id) => baseSchedule(byId.get(id)?.current_schedule)).filter(Boolean)
  )].sort();

  return {
    outlets: [...touched].map((id) => byId.get(id)).filter(Boolean),
    schedules: touchedSchedules,
    conflicts,
    newArtwork: items.some((i) => i.kind === 'new_product'),
    products: [...new Set(items.map((i) => i.product_id).filter(Boolean))].map((id) => productById.get(id)).filter(Boolean),
  };
}

// A short line for each ask, in the words a person would use.
export function describeItem(item, outletNames) {
  const at = (ids) => {
    const names = ids.map((id) => outletNames.get(id) || '?');
    return names.length <= 4 ? names.join(', ') : `${names.slice(0, 4).join(', ')} and ${names.length - 4} more`;
  };
  switch (item.kind) {
    case 'price':
      return `${item.product_label} — £${item.from_price || '—'} becomes £${item.to_price}${item.soldAt ? ` (every one of the ${item.soldAt} outlets that sell it)` : ''}`;
    case 'add':
      return `${item.product_label} goes on at ${at(item.outlet_ids)}`;
    case 'remove':
      return `${item.product_label} comes off at ${at(item.outlet_ids)}`;
    case 'new_product':
      return `New product: ${item.product_label}${item.to_price ? ` at £${item.to_price}` : ''}, at ${at(item.outlet_ids)} — needs artwork`;
    default:
      return item.product_label;
  }
}

// A title for the request, if nobody types one.
export function suggestTitle(items, outletNames) {
  if (!items.length) return '';
  if (items.length === 1) return describeItem(items[0], outletNames);
  const outlets = new Set(items.flatMap((i) => i.outlet_ids));
  return `${items.length} menu changes${outlets.size ? ` at ${outlets.size} ${outlets.size === 1 ? 'outlet' : 'outlets'}` : ''}`;
}

export const STATUSES = [
  { key: 'received', label: 'Received' },
  { key: 'in_design', label: 'In design' },
  { key: 'ready', label: 'Ready to load' },
  { key: 'live', label: 'Live' },
];
