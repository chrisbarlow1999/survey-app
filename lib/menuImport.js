// The import's two halves, kept out of the component so they can be run
// against a real workbook without a browser. buildImportPlan is pure: the
// preview and the apply step read the same plan, so they can't disagree.

import { productKey, outletKey, matchOutlet, parseClientScreens } from './menus';

// Works out every write the import needs, against what's already saved.
// Pure, so the preview and the apply step can't disagree.
export function buildImportPlan({ sheet, key, sections, products, outlets, ranges, targetSet }) {
  const warnings = [];
  const sectionByName = new Map(sections.map((s) => [s.name.trim().toLowerCase(), s]));
  const sectionName = new Map(sections.map((s) => [s.id, s.name]));
  const productByKey = new Map(products.map((p) => [productKey(sectionName.get(p.section_id), p.name, p.detail), p]));
  const outletByKey = new Map(outlets.map((o) => [outletKey(o.name), o]));

  const plan = {
    sheet: Boolean(sheet), key: Boolean(key),
    newSections: [], newProducts: [], productUpdates: [], productsNotOnSheet: [],
    newOutlets: [], outletUpdates: [], pairs: [], rangeChanges: [],
    keyUpdates: [], keyUnmatched: [], warnings,
    sheetProductKeys: [],
  };

  if (sheet) {
    // Sheet product index → key. Two rows with the same key are one product;
    // their ticks are merged rather than one silently winning.
    const seenProducts = new Map();
    sheet.products.forEach((p, i) => {
      const k = productKey(p.section, p.name, p.detail);
      plan.sheetProductKeys[i] = k;
      if (seenProducts.has(k)) {
        const first = seenProducts.get(k);
        warnings.push(
          (first.price || '') !== (p.price || '')
            ? `"${p.name}" appears twice under ${p.section} at different prices (£${first.price || '—'} and £${p.price || '—'}). They're merged at £${first.price || '—'} — check which is right.`
            : `"${p.name}" appears twice under ${p.section}; the two rows are merged.`
        );
        return;
      }
      seenProducts.set(k, p);
      if (!sectionByName.has(p.section.trim().toLowerCase()) && !plan.newSections.includes(p.section)) {
        plan.newSections.push(p.section);
      }
      const existing = productByKey.get(k);
      if (!existing) {
        plan.newProducts.push({ key: k, section: p.section, name: p.name, detail: p.detail || null, price: p.price || null, tier_note: p.tier_note || null, position: i });
      } else {
        const what = [];
        if ((existing.price || '') !== (p.price || '')) what.push(`£${existing.price || '—'} → £${p.price || '—'}`);
        if ((existing.tier_note || '') !== (p.tier_note || '')) what.push(`applies to "${p.tier_note || 'all'}"`);
        if (existing.archived_at) what.push('restored');
        if (what.length) {
          plan.productUpdates.push({
            id: existing.id,
            label: existing.name,
            what: what.join(', '),
            patch: { price: p.price || null, tier_note: p.tier_note || null, archived_at: null },
          });
        }
      }
    });
    plan.productsNotOnSheet = products.filter((p) => !p.archived_at && !seenProducts.has(productKey(sectionName.get(p.section_id), p.name, p.detail)));

    const seenOutlets = new Set();
    for (const o of sheet.outlets) {
      const k = outletKey(o.name);
      if (seenOutlets.has(k)) {
        warnings.push(`Outlet "${o.name}" appears twice on the sheet; its ticks are merged.`);
        continue;
      }
      seenOutlets.add(k);
      const fields = {
        menu_tier: o.menu_tier || null,
        menu_type: o.menu_type || null,
        client_screens: o.client_screens || null,
        notes: o.note || null,
      };
      const existing = outletByKey.get(k);
      if (!existing) {
        plan.newOutlets.push({ key: k, name: o.name, ...fields, ...parseClientScreens(o.client_screens) });
      } else {
        // Notes are only filled in, never overwritten: a PM may have written
        // something better than the sheet's cell.
        const patch = {};
        for (const f of ['menu_tier', 'menu_type', 'client_screens']) {
          if ((existing[f] || null) !== fields[f]) patch[f] = fields[f];
        }
        if (!existing.notes && fields.notes) patch.notes = fields.notes;
        if (existing.archived_at) patch.archived_at = null;
        if (Object.keys(patch).length) plan.outletUpdates.push({ id: existing.id, patch });
      }
    }

    // Ticks, as keys, so they can be compared with what's saved before any id exists.
    const pairSet = new Set();
    for (const o of sheet.outlets) {
      for (const idx of o.products) pairSet.add(`${outletKey(o.name)}::${plan.sheetProductKeys[idx]}`);
    }
    plan.pairs = [...pairSet].map((s) => {
      const [outlet, product] = s.split('::');
      return { outlet, product };
    });

    // What this sheet changes against the ticks saved in the target set, per
    // outlet — the check that's done by eye today.
    if (targetSet !== 'new') {
      const productName = new Map();
      sheet.products.forEach((p, i) => productName.set(plan.sheetProductKeys[i], p.name));
      const productKeyById = new Map();
      for (const p of products) {
        const k = productKey(sectionName.get(p.section_id), p.name, p.detail);
        productKeyById.set(p.id, k);
        if (!productName.has(k)) productName.set(k, p.name);
      }
      const outletKeyById = new Map(outlets.map((o) => [o.id, outletKey(o.name)]));
      const saved = new Set();
      for (const r of ranges) {
        if (r.menu_set_id !== targetSet) continue;
        const ok = outletKeyById.get(r.outlet_id);
        const pk = productKeyById.get(r.product_id);
        // Only outlets on this sheet are replaced, so only they are compared.
        if (ok && pk && seenOutlets.has(ok)) saved.add(`${ok}::${pk}`);
      }
      plan.rangeChanges = diffPairs(pairSet, saved, productName, sheet.outlets);
    }
  }

  if (key) {
    // Match against outlets as they'll be after this import, so a master
    // schedule uploaded with a range sheet in the same workbook still lines up.
    const pool = [
      ...outlets.map((o) => ({ ...o, key: outletKey(o.name) })),
      ...plan.newOutlets.map((o) => ({ ...o, id: null })),
    ];
    const claimed = new Map();
    for (const row of key.rows) {
      const hit = matchOutlet(pool, row.kiosk);
      if (!hit) {
        plan.keyUnmatched.push(row.kiosk);
        continue;
      }
      const k = hit.key || outletKey(hit.name);
      if (claimed.has(k)) {
        warnings.push(`"${row.kiosk}" and "${claimed.get(k)}" both match outlet ${hit.name}; only the first is used.`);
        continue;
      }
      claimed.set(k, row.kiosk);
      const patch = {
        store_code: row.store_code || null,
        landscape_screens: row.landscape,
        portrait_screens: row.portrait,
        current_schedule: row.schedule || null,
      };
      const changed = Object.entries(patch).some(([f, v]) => (hit[f] ?? null) !== v);
      if (changed) plan.keyUpdates.push({ outletKey: k, patch });
    }
  }

  plan.hasChanges = Boolean(
    plan.newSections.length || plan.newProducts.length || plan.productUpdates.length ||
    plan.newOutlets.length || plan.outletUpdates.length || plan.keyUpdates.length ||
    (sheet && (targetSet === 'new' || plan.rangeChanges.length))
  );
  return plan;
}

function diffPairs(incoming, saved, productName, sheetOutlets) {
  const byOutlet = new Map();
  const note = (pair, field) => {
    const [outlet, product] = pair.split('::');
    if (!byOutlet.has(outlet)) byOutlet.set(outlet, { added: [], removed: [] });
    byOutlet.get(outlet)[field].push(productName.get(product) || product);
  };
  for (const p of incoming) if (!saved.has(p)) note(p, 'added');
  for (const p of saved) if (!incoming.has(p)) note(p, 'removed');
  // Report in sheet order, under the sheet's own spelling of the name.
  return sheetOutlets
    .map((o) => ({ outlet: o.name, ...(byOutlet.get(outletKey(o.name)) || {}) }))
    .filter((d) => d.added || d.removed)
    .map((d) => ({ outlet: d.outlet, added: d.added || [], removed: d.removed || [] }));
}

export async function applyImportPlan(supabase, venueId, plan, { targetSet, newSetName, setCount }) {
  const fail = (what, err) => {
    throw new Error(`${what}: ${err.message}. Anything before this step was saved; re-running the import will pick up where it stopped.`);
  };

  // Sections
  const { data: sectionRows, error: sErr } = await supabase.from('menu_sections').select('id, name, position').eq('venue_id', venueId);
  if (sErr) fail('Could not read sections', sErr);
  const sectionId = new Map(sectionRows.map((s) => [s.name.trim().toLowerCase(), s.id]));
  if (plan.newSections.length) {
    const start = sectionRows.length;
    const { data, error } = await supabase
      .from('menu_sections')
      .insert(plan.newSections.map((name, i) => ({ venue_id: venueId, name, position: start + i })))
      .select('id, name');
    if (error) fail('Could not add sections', error);
    data.forEach((s) => sectionId.set(s.name.trim().toLowerCase(), s.id));
  }

  // Products
  if (plan.newProducts.length) {
    const { error } = await supabase.from('menu_products').insert(
      plan.newProducts.map((p) => ({
        venue_id: venueId,
        section_id: sectionId.get(p.section.trim().toLowerCase()),
        name: p.name, detail: p.detail, price: p.price, tier_note: p.tier_note, position: p.position,
      }))
    );
    if (error) fail('Could not add products', error);
  }
  await inBatches(plan.productUpdates, (u) =>
    supabase.from('menu_products').update(u.patch).eq('id', u.id), `Could not update a product`, fail);

  // Outlets
  if (plan.newOutlets.length) {
    const { error } = await supabase.from('menu_outlets').insert(
      plan.newOutlets.map((o, i) => ({
        venue_id: venueId, name: o.name, menu_tier: o.menu_tier, menu_type: o.menu_type,
        client_screens: o.client_screens, notes: o.notes,
        landscape_screens: o.landscape, portrait_screens: o.portrait,
        position: i,
      }))
    );
    if (error) fail('Could not add outlets', error);
  }
  await inBatches(plan.outletUpdates, (u) =>
    supabase.from('menu_outlets').update(u.patch).eq('id', u.id), 'Could not update an outlet', fail);

  // Everything below needs ids, so read the venue back once.
  const [{ data: outletRows, error: oErr }, { data: productRows, error: pErr }] = await Promise.all([
    supabase.from('menu_outlets').select('id, name').eq('venue_id', venueId),
    supabase.from('menu_products').select('id, name, detail, section_id').eq('venue_id', venueId),
  ]);
  if (oErr) fail('Could not read outlets back', oErr);
  if (pErr) fail('Could not read products back', pErr);
  const outletId = new Map(outletRows.map((o) => [outletKey(o.name), o.id]));
  const sectionNameById = new Map([...sectionId.entries()].map(([name, id]) => [id, name]));
  const productId = new Map(productRows.map((p) => [productKey(sectionNameById.get(p.section_id), p.name, p.detail), p.id]));

  await inBatches(plan.keyUpdates.filter((u) => outletId.has(u.outletKey)), (u) =>
    supabase.from('menu_outlets').update(u.patch).eq('id', outletId.get(u.outletKey)), 'Could not apply the master schedule', fail);

  if (plan.sheet) {
    let setId = targetSet;
    if (targetSet === 'new') {
      const { data, error } = await supabase
        .from('menu_sets')
        .insert({ venue_id: venueId, name: newSetName, position: setCount })
        .select('id')
        .single();
      if (error) fail('Could not add the menu set', error);
      setId = data.id;
    }
    const pairs = plan.pairs
      .map((p) => ({ outlet_id: outletId.get(p.outlet), product_id: productId.get(p.product) }))
      .filter((p) => p.outlet_id && p.product_id);
    if (pairs.length !== plan.pairs.length) {
      throw new Error(`${plan.pairs.length - pairs.length} ticks couldn't be matched to a saved product or outlet, so the set was not changed.`);
    }
    const { error } = await supabase.rpc('menu_replace_ranges', { p_set_id: setId, p_pairs: pairs });
    if (error) fail('Could not save the ticks', error);
  }
}

// Row-by-row updates, ten at a time: a master schedule touches ~80 outlets,
// which is slow one after another and rude all at once.
async function inBatches(items, run, message, fail) {
  for (let i = 0; i < items.length; i += 10) {
    const results = await Promise.all(items.slice(i, i + 10).map(run));
    const bad = results.find((r) => r.error);
    if (bad) fail(message, bad.error);
  }
}
