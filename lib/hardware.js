import { SCREEN_SIZES, MOUNT_TYPES } from './screenSizes';

// The screens and mounts the survey forms offer (migration 048, managed under
// Admin → Hardware). Safe to import from server and client code alike; the
// client-side hook lives in lib/useHardware.js.
//
// Surveys store an item's KEY, never its label, so a key that's since been
// retired — or one the table doesn't know at all — still resolves: first
// against the table (retired rows included), then against the original
// hard-coded list in lib/screenSizes.js. That list is also the whole answer
// until migration 048 has been run.

export const CUSTOM_SCREEN_KEY = 'other';   // shows custom width/height boxes
export const OTHER_MOUNT = 'Other';          // shows a free-text box; never a table row

export const DEFAULT_HARDWARE = {
  fromDb: false,
  screens: Object.entries(SCREEN_SIZES).map(([key, s]) => ({
    key, label: s.label, model: s.model, wmm: s.wmm, hmm: s.hmm, active: true,
  })),
  mounts: MOUNT_TYPES.filter((m) => m !== OTHER_MOUNT).map((m) => ({ key: m, label: m, active: true })),
};

export function hardwareFromRows(rows) {
  const sorted = [...rows].sort((a, b) => (a.position - b.position) || a.label.localeCompare(b.label));
  return {
    fromDb: true,
    screens: sorted.filter((r) => r.kind === 'screen').map((r) => ({
      id: r.id, key: r.key, label: r.label, model: r.model, wmm: r.width_mm, hmm: r.height_mm,
      active: r.active, position: r.position,
    })),
    mounts: sorted.filter((r) => r.kind === 'mount').map((r) => ({
      id: r.id, key: r.key, label: r.label, active: r.active, position: r.position,
    })),
  };
}

// Never throws: a failed read (table missing, network) falls back to defaults
// so a survey form or report always renders.
export async function loadHardware(supabase) {
  try {
    const { data, error } = await supabase
      .from('hardware_items')
      .select('id, kind, key, label, model, width_mm, height_mm, active, position');
    if (error || !data || !data.some((r) => r.kind === 'screen')) return DEFAULT_HARDWARE;
    return hardwareFromRows(data);
  } catch {
    return DEFAULT_HARDWARE;
  }
}

// { label, model, wmm, hmm } for a stored screen key, or null if unknown.
export function screenInfo(hw, key) {
  if (!key) return null;
  const row = (hw || DEFAULT_HARDWARE).screens.find((s) => s.key === key);
  if (row) return row;
  const legacy = SCREEN_SIZES[key];
  return legacy ? { key, label: legacy.label, model: legacy.model, wmm: legacy.wmm, hmm: legacy.hmm, active: false } : null;
}

// Dropdown options: the active items, plus the current value if it's retired
// or unknown — otherwise editing an old survey would silently blank it.
export function screenOptions(hw, current) {
  const list = (hw || DEFAULT_HARDWARE).screens;
  const opts = list.filter((s) => s.active).map((s) => ({ value: s.key, label: s.label }));
  if (current && !opts.some((o) => o.value === current)) {
    const info = screenInfo(hw, current);
    opts.push({ value: current, label: `${info?.label || current} (retired)` });
  }
  return opts;
}

// 'Other' always comes last.
export function mountOptions(hw, current) {
  const list = (hw || DEFAULT_HARDWARE).mounts;
  const opts = list.filter((m) => m.active).map((m) => ({ value: m.key, label: m.label }));
  if (current && current !== OTHER_MOUNT && !opts.some((o) => o.value === current)) {
    const row = list.find((m) => m.key === current);
    opts.push({ value: current, label: `${row?.label || current} (retired)` });
  }
  opts.push({ value: OTHER_MOUNT, label: OTHER_MOUNT });
  return opts;
}

// Screen dimensions for the drawing: typed in for a custom wall, looked up otherwise.
export function screenDims(hw, key, customW, customH) {
  if (key === CUSTOM_SCREEN_KEY) return { wmm: Number(customW) || null, hmm: Number(customH) || null };
  const info = screenInfo(hw, key);
  return { wmm: info?.wmm ?? null, hmm: info?.hmm ?? null };
}
