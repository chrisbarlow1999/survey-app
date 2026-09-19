import ExcelJS from 'exceljs';

// Reads the spreadsheets a venue runs on today, so it can be set up from them
// instead of retyped:
//
//   a range sheet     products down the side, outlets across the top, a tick
//                     per cell ("Products by area")
//   a master schedule a KEY tab listing every kiosk with its store code,
//                     screens and schedule
//
// NOTHING HERE KNOWS ABOUT ONE CLIENT'S LAYOUT. A range sheet is found by its
// shape — a block of ticks with labels up the side and across the top — and
// then read through a mapping that says which row holds outlet names, which
// column holds the price, and so on. The mapping is guessed, shown to whoever
// is importing, corrected if the guess is wrong, and saved against the client
// so the next import of the same sheet is one click.
//
// Server-only: exceljs is far too heavy to ship to the browser.

const SCAN_ROWS = 600;
const SCAN_COLS = 300;
const PREVIEW_ROWS = 28;
const PREVIEW_COLS = 12;

function cellValue(cell) {
  const v = cell?.value;
  if (v == null) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return v.result ?? null;
    if ('text' in v) return v.text;
    return null;
  }
  return v;
}

function text(cell) {
  const v = cellValue(cell);
  if (v == null || typeof v === 'boolean') return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, ' ').trim();
}

function priceText(cell) {
  const v = cellValue(cell);
  if (typeof v === 'number') return v.toFixed(2);
  return text(cell);
}

// A tick is a real boolean in the cell, or one of the words people type when
// their spreadsheet has no checkboxes. Both states matter: a column of FALSEs
// is still an outlet column, which is how an outlet that sells nothing yet is
// found at all.
const TICK_ON = /^(true|yes|y|x|✓|✔)$/i;
const TICK_OFF = /^(false|no|n|-|–|—)$/i;

function tick(cell) {
  const v = cellValue(cell);
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (TICK_ON.test(s)) return true;
    if (TICK_OFF.test(s)) return false;
  }
  return null;
}

// "£6.60", "6.60 | 3.30", "5.50" — anything whose first number reads as money.
// Deliberately loose: the price is stored as the sheet writes it.
function looksLikePrice(cell) {
  const v = cellValue(cell);
  if (typeof v === 'number') return true;
  const s = text(cell);
  if (!s) return false;
  return /^[£$€]?\s*\d+([.,]\d{1,2})?(\s*[|/]\s*[£$€]?\s*\d+([.,]\d{1,2})?)*$/.test(s);
}

const bounds = (ws) => ({
  rows: Math.min(ws.rowCount || 0, SCAN_ROWS),
  cols: Math.min(ws.columnCount || 0, SCAN_COLS),
});

// ============================================================
// Working out a sheet's shape
// ============================================================
// Returns a mapping the import screen can show and change, or null when the
// sheet holds no grid of ticks at all (an instructions tab, a wayfinding tab).
export function analyseSheet(ws) {
  const { rows, cols } = bounds(ws);
  if (!rows || !cols) return null;

  const tickRows = new Map();
  const tickCols = new Map();
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      if (tick(ws.getCell(r, c)) === null) continue;
      tickRows.set(r, (tickRows.get(r) || 0) + 1);
      tickCols.set(c, (tickCols.get(c) || 0) + 1);
    }
  }

  // Three ticks in a line is enough to call it a row of a product or a column
  // of an outlet; fewer is a stray "N/A" somewhere.
  const productRows = [...tickRows.entries()].filter(([, n]) => n >= 3).map(([r]) => r).sort((a, b) => a - b);
  const outletCols = [...tickCols.entries()].filter(([, n]) => n >= 3).map(([c]) => c).sort((a, b) => a - b);
  if (productRows.length < 3 || outletCols.length < 2) return null;

  const firstProductRow = productRows[0];
  const lastProductRow = productRows[productRows.length - 1];
  const firstOutletCol = outletCols[0];

  // The outlet names are the row above the grid with the most DIFFERENT values
  // in it. Fullness alone picks the wrong row: a screen-count row is just as
  // full as the names, but says "4" eighty times.
  let headerRow = 1;
  let headerScore = -1;
  for (let r = 1; r < firstProductRow; r++) {
    const values = outletCols.map((c) => text(ws.getCell(r, c))).filter(Boolean);
    const distinct = new Set(values.map((v) => v.toLowerCase())).size;
    if (distinct > headerScore) {
      headerScore = distinct;
      headerRow = r;
    }
  }

  // Label columns: everything left of the grid, scored on how often it holds
  // text beside a product, how often that text reads as a price, and how many
  // different things it says. Distinctness is what separates the three kinds
  // of label column: a product name is nearly all different, a section repeats
  // a handful of values, a price is a price.
  const labelCols = [];
  for (let c = 1; c < firstOutletCol; c++) {
    let filled = 0;
    let prices = 0;
    const values = new Set();
    for (const r of productRows) {
      const cell = ws.getCell(r, c);
      const t = text(cell);
      if (t) {
        filled++;
        values.add(t.toLowerCase());
      }
      if (looksLikePrice(cell)) prices++;
    }
    labelCols.push({ col: c, filled, prices, distinct: values.size });
  }
  const words = labelCols.filter((c) => c.filled - c.prices > 0);
  const nameCol = words.slice().sort((a, b) => b.distinct - a.distinct || a.col - b.col)[0]?.col || 1;
  const priceCol = labelCols.filter((c) => c.col !== nameCol && c.prices > productRows.length * 0.3)
    .sort((a, b) => b.prices - a.prices || a.col - b.col)[0]?.col || null;
  // A full column saying the same few things over and over is the section a
  // product belongs to — "DRINKS", "FOOD".
  const sectionCol = words.filter((c) => c.col !== nameCol && c.col !== priceCol
    && c.filled > productRows.length * 0.7 && c.distinct > 1 && c.distinct <= Math.max(4, productRows.length * 0.3))
    .sort((a, b) => a.distinct - b.distinct || a.col - b.col)[0]?.col || null;
  // A sparse column left of the name — Man United's "Menu 1/2/3" — qualifies a
  // product rather than naming it.
  const tierNoteCol = labelCols.filter((c) => ![nameCol, priceCol, sectionCol].includes(c.col) && c.filled > 0 && c.filled < productRows.length * 0.5)
    .sort((a, b) => b.filled - a.filled || a.col - b.col)[0]?.col || null;

  // Is the line under a product (ABV, size) its detail, or is detail a column
  // of its own?
  const productRowSet = new Set(productRows);
  let below = 0;
  for (const r of productRows) {
    const next = r + 1;
    if (next <= lastProductRow && !productRowSet.has(next) && text(ws.getCell(next, nameCol))) below++;
  }
  const detailColCandidate = labelCols
    .filter((c) => ![nameCol, priceCol, tierNoteCol, sectionCol].includes(c.col) && c.filled > productRows.length * 0.5)
    .sort((a, b) => b.distinct - a.distinct || a.col - b.col)[0]?.col || null;
  const detailMode = below > productRows.length * 0.3 ? 'below' : detailColCandidate ? 'column' : 'none';

  // Rows between the outlet names and the first product describe the outlets:
  // menu tier, menu type, a note, a screen count. Guessed by what they hold,
  // and all of it changeable on screen.
  const attrRows = [];
  for (let r = headerRow + 1; r < firstProductRow; r++) {
    const values = outletCols.map((c) => text(ws.getCell(r, c))).filter(Boolean);
    if (!values.length) continue;
    const numberish = values.filter((v) => /^\d+/.test(v) || /^n\/?a$/i.test(v)).length;
    attrRows.push({
      row: r,
      role: numberish > values.length * 0.5 ? 'client_screens' : 'unassigned',
      sample: values.slice(0, 3).join(' · '),
      filled: values.length,
    });
  }
  // The first two descriptive rows are, in every sheet seen so far, the
  // client's own classification and the name of the menu that outlet runs.
  const descriptive = attrRows.filter((a) => a.role === 'unassigned');
  if (descriptive[0]) descriptive[0].role = 'menu_tier';
  if (descriptive[1]) descriptive[1].role = 'menu_type';
  if (descriptive[2]) descriptive[2].role = 'notes';

  return {
    kind: 'grid',
    headerRow,
    firstProductRow,
    lastProductRow,
    nameCol,
    priceCol,
    tierNoteCol,
    detailMode,
    detailCol: detailMode === 'column' ? detailColCandidate : null,
    // Sections are either a column of their own, or headings inside the grid:
    // a row with a label but no ticks on it, like "BOTTLES & CANS".
    sectionMode: sectionCol ? 'column' : 'headings',
    sectionCol,
    attrRows: attrRows.map(({ row, role, sample }) => ({ row, role, sample })),
    // Reported so the screen can say what it found; not used when reading.
    found: { outlets: outletCols.length, products: productRows.length },
  };
}

// The first few rows and columns as plain text, so the mapping can be checked
// against the sheet without downloading it again.
export function previewSheet(ws, mapping) {
  const { rows, cols } = bounds(ws);
  const lastRow = Math.min(rows, Math.max(PREVIEW_ROWS, (mapping?.firstProductRow || 0) + 8));
  const outletCols = mapping ? outletColumns(ws, mapping).slice(0, 3) : [];
  const labelCols = [];
  for (let c = 1; c <= Math.min(cols, PREVIEW_COLS); c++) labelCols.push(c);
  const shown = [...new Set([...labelCols, ...outletCols])].sort((a, b) => a - b);

  const cells = [];
  for (let r = 1; r <= lastRow; r++) {
    cells.push(shown.map((c) => {
      const t = tick(ws.getCell(r, c));
      if (t !== null) return t ? '✓' : '·';
      return text(ws.getCell(r, c)).slice(0, 28);
    }));
  }
  // Which of the shown columns are outlets, so the screen can describe a row
  // by what stands over the outlets ("EK01, EK02…") rather than by whatever
  // note the client left in column B.
  return { columns: shown, rows: cells, outletColumns: outletCols };
}

// Outlet columns are worked out from the sheet every time rather than stored:
// a client who adds a kiosk adds a column, and the saved mapping shouldn't
// have to know about it. A column counts when it has ticks, or when it has a
// name on the header row and sits inside the grid.
function outletColumns(ws, mapping) {
  const { rows, cols } = bounds(ws);
  const lastRow = Math.min(rows, mapping.lastProductRow || rows);
  const roleCols = new Set([mapping.nameCol, mapping.priceCol, mapping.tierNoteCol, mapping.detailCol].filter(Boolean));

  const withTicks = [];
  for (let c = 1; c <= cols; c++) {
    if (roleCols.has(c)) continue;
    let n = 0;
    for (let r = mapping.firstProductRow; r <= lastRow; r++) {
      if (tick(ws.getCell(r, c)) !== null) n++;
    }
    if (n >= 3) withTicks.push(c);
  }
  const first = withTicks.length ? withTicks[0] : Math.max(...roleCols, 0) + 1;

  const all = [];
  for (let c = first; c <= cols; c++) {
    if (roleCols.has(c)) continue;
    if (withTicks.includes(c) || text(ws.getCell(mapping.headerRow, c))) all.push(c);
  }
  return all;
}

// ============================================================
// Reading a sheet through a mapping
// ============================================================
export function readGridSheet(ws, mapping) {
  const { rows } = bounds(ws);
  const lastRow = Math.min(rows, mapping.lastProductRow || rows);
  // Reading starts below the rows that describe the outlets, not at the first
  // ticked row: the first section's heading sits above its first product.
  const firstRow = Math.max(
    mapping.headerRow + 1,
    ...(mapping.attrRows || []).map((a) => a.row + 1)
  );
  const cols = outletColumns(ws, mapping);
  const attrByRole = new Map((mapping.attrRows || []).filter((a) => a.role && a.role !== 'unassigned').map((a) => [a.role, a.row]));
  const attr = (role, col) => (attrByRole.has(role) ? text(ws.getCell(attrByRole.get(role), col)) : '');

  const outlets = cols
    .map((col) => ({
      col,
      name: text(ws.getCell(mapping.headerRow, col)),
      menu_tier: attr('menu_tier', col),
      menu_type: attr('menu_type', col),
      note: attr('notes', col),
      client_screens: attr('client_screens', col),
      products: [],
    }))
    .filter((o) => o.name);

  const products = [];
  let section = null;
  let tierNote = '';
  let lastProductRow = -1;

  for (let r = firstRow; r <= lastRow; r++) {
    const label = text(ws.getCell(r, mapping.nameCol));
    const qualifier = mapping.tierNoteCol ? text(ws.getCell(r, mapping.tierNoteCol)) : '';
    const ticks = outlets.map((o) => tick(ws.getCell(r, o.col)));
    const isProduct = ticks.some((t) => t !== null);

    if (!isProduct) {
      if (!label) {
        // A blank row ends a qualifier block ("Menu 1/2/3"), so a line after
        // it isn't labelled as belonging to that tier.
        if (!qualifier) tierNote = '';
        continue;
      }
      // A product's detail line sits directly under it, and has to be checked
      // before the heading test: "4.6% ABV" is all capitals too.
      if (mapping.detailMode === 'below' && lastProductRow === r - 1 && !qualifier && products.length) {
        products[products.length - 1].detail = label;
        continue;
      }
      if (mapping.sectionMode === 'headings') {
        section = label;
        tierNote = '';
      }
      continue;
    }

    if (mapping.sectionMode === 'column' && mapping.sectionCol) {
      section = text(ws.getCell(r, mapping.sectionCol)) || section;
    }
    // A qualifier applies to every row under it until the next one or the next
    // section: the sheet only writes it once per block.
    if (qualifier) tierNote = qualifier;

    products.push({
      section: section || 'UNSORTED',
      name: label,
      detail: mapping.detailMode === 'column' && mapping.detailCol ? text(ws.getCell(r, mapping.detailCol)) : '',
      price: mapping.priceCol ? priceText(ws.getCell(r, mapping.priceCol)) : '',
      tier_note: tierNote,
    });
    lastProductRow = r;
    const index = products.length - 1;
    outlets.forEach((o, i) => {
      if (ticks[i] === true) o.products.push(index);
    });
  }

  return { outlets: outlets.map(({ col, ...o }) => o), products };
}

// ============================================================
// The master schedule's KEY tab
// ============================================================
// "6 LANDSCAPE, 4 PORTRAIT", "2 STRETCH". A stretch screen is counted with the
// landscape ones: it plays landscape content.
export function parseMasterScreens(raw) {
  const s = (raw || '').toUpperCase();
  let landscape = 0;
  let portrait = 0;
  let found = false;
  for (const m of s.matchAll(/(\d+)\s*(LANDSCAPE|PORTRAIT|STRETCH)/g)) {
    found = true;
    if (m[2] === 'PORTRAIT') portrait += Number(m[1]);
    else landscape += Number(m[1]);
  }
  return found ? { landscape, portrait } : { landscape: null, portrait: null };
}

// Found by its column headings rather than its position, so a client who adds
// a column or starts the table lower down still reads.
function findKeyColumns(ws) {
  const { rows, cols } = bounds(ws);
  for (let r = 1; r <= Math.min(rows, 8); r++) {
    const heads = [];
    for (let c = 1; c <= Math.min(cols, 20); c++) heads[c] = text(ws.getCell(r, c)).toUpperCase();
    const kiosk = heads.findIndex((h) => /^(KIOSK|OUTLET|STORE NAME|AREA)$/.test(h || ''));
    if (kiosk < 1) continue;
    const code = heads.findIndex((h) => /STORE CODE|MYSCREENS|CODE$/.test(h || ''));
    const schedule = heads.findIndex((h) => /SCHEDULE/.test(h || ''));
    if (code < 1 && schedule < 1) continue;
    return {
      headerRow: r,
      kiosk,
      code: code > 0 ? code : null,
      screens: heads.findIndex((h) => /SCREEN/.test(h || '')) > 0 ? heads.findIndex((h) => /SCREEN/.test(h || '')) : null,
      schedule: schedule > 0 ? schedule : null,
      menu: heads.findIndex((h) => /^MENU/.test(h || '')) > 0 ? heads.findIndex((h) => /^MENU/.test(h || '')) : null,
    };
  }
  return null;
}

function readKeySheet(ws, map) {
  const rows = [];
  ws.eachRow((row, r) => {
    if (r <= map.headerRow) return;
    const kiosk = text(row.getCell(map.kiosk));
    if (!kiosk) return;
    const screens = map.screens ? text(row.getCell(map.screens)) : '';
    rows.push({
      menu: map.menu ? text(row.getCell(map.menu)) : '',
      kiosk,
      store_code: map.code ? text(row.getCell(map.code)) : '',
      screens,
      ...parseMasterScreens(screens),
      schedule: map.schedule ? text(row.getCell(map.schedule)) : '',
    });
  });
  return rows;
}

// ============================================================
// The whole workbook
// ============================================================
// `mappings` is { [sheetName]: mapping } — whatever the client's saved profile
// holds, or what the importer changed on screen. Anything not covered there is
// worked out from the sheet.
export async function readMenuWorkbook(buffer, mappings = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const rangeSheets = [];
  let key = null;

  wb.eachSheet((ws) => {
    if (!key) {
      const keyMap = findKeyColumns(ws);
      if (keyMap) {
        const rows = readKeySheet(ws, keyMap);
        if (rows.length) key = { name: ws.name, rows };
        if (key) return;
      }
    }

    const suggestion = analyseSheet(ws);
    if (!suggestion) return;
    // "*" is a saved layout being tried against whatever tab this workbook
    // holds: the client renames and copies tabs constantly, so a layout can't
    // be tied to a tab name.
    const mapping = { ...suggestion, ...(mappings[ws.name] || mappings['*'] || {}) };
    const parsed = readGridSheet(ws, mapping);
    if (!parsed.outlets.length || !parsed.products.length) return;
    rangeSheets.push({
      name: ws.name,
      hidden: ws.state !== 'visible',
      suggestion,
      mapping,
      preview: previewSheet(ws, mapping),
      ...parsed,
    });
  });

  return { rangeSheets, key };
}
