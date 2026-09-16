import ExcelJS from 'exceljs';

// Reads the two spreadsheets a stadium runs on today, so a venue can be set up
// from them instead of retyped:
//
//   the client's range sheet  products down the side, outlets across the top,
//                             a checkbox per cell ("Products by area")
//   Linney's master schedule  a KEY sheet listing every kiosk with its store
//                             code, screens and schedule
//
// Both formats are matched on their headers, not on sheet names, because the
// client renames and copies tabs ("Updates for 13.09"). Server-only: exceljs is
// far too heavy to ship to the browser.

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

const RANGE_SHEET_MARKER = /store name within linney/i;

function isRangeSheet(ws) {
  return RANGE_SHEET_MARKER.test(text(ws.getCell(1, 5)));
}

function isKeySheet(ws) {
  const heads = [1, 2, 3, 4, 5].map((c) => text(ws.getCell(1, c)).toUpperCase());
  return heads[1] === 'KIOSK' && heads[2] === 'STORE CODE' && heads[4] === 'SCHEDULE CODE';
}

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

function readRangeSheet(ws) {
  const outlets = [];
  ws.getRow(2).eachCell((cell, col) => {
    const name = text(cell);
    if (col >= 5 && name) outlets.push({ col, name });
  });
  for (const o of outlets) {
    o.menu_tier = text(ws.getCell(3, o.col));
    o.menu_type = text(ws.getCell(4, o.col));
    o.note = text(ws.getCell(5, o.col));
    o.client_screens = text(ws.getCell(7, o.col));
    o.products = [];
  }

  const products = [];
  let section = null;
  let tierNote = '';
  let lastProductRow = -1;

  for (let r = 8; r <= ws.rowCount; r++) {
    const a = text(ws.getCell(r, 1));
    const b = text(ws.getCell(r, 2));
    if (!b) {
      // A blank row ends a "Menu 1/2/3" block, so the discount line after the
      // meal deals isn't labelled as belonging to one tier.
      if (!a) tierNote = '';
      continue;
    }

    const ticks = outlets.map((o) => cellValue(ws.getCell(r, o.col)));
    const isProduct = ticks.some((t) => typeof t === 'boolean');

    if (!isProduct) {
      // A product's detail line sits directly under it. That has to be checked
      // before the heading test: "4.6% ABV" is all capitals too.
      if (a !== 'Screen Name:' && lastProductRow === r - 1) {
        products[products.length - 1].detail = b;
        continue;
      }
      if (a === 'Screen Name:' || (b === b.toUpperCase() && /[A-Z]/.test(b) && !text(ws.getCell(r, 3)))) {
        section = b;
        tierNote = '';
      }
      continue;
    }

    // "Menu 1/2/3" in column A applies to every row under it until the next
    // label or section — the sheet only writes it once per block.
    if (a) tierNote = a;
    products.push({
      section: section || 'UNSORTED',
      name: b,
      detail: '',
      price: priceText(ws.getCell(r, 3)),
      tier_note: tierNote,
    });
    lastProductRow = r;
    const index = products.length - 1;
    outlets.forEach((o, i) => {
      if (ticks[i] === true) o.products.push(index);
    });
  }

  return {
    outlets: outlets.map(({ col, ...o }) => o),
    products,
  };
}

function readKeySheet(ws) {
  const rows = [];
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const kiosk = text(row.getCell(2));
    if (!kiosk) return;
    const screens = text(row.getCell(4));
    rows.push({
      menu: text(row.getCell(1)),
      kiosk,
      store_code: text(row.getCell(3)),
      screens,
      ...parseMasterScreens(screens),
      schedule: text(row.getCell(5)),
    });
  });
  return rows;
}

export async function readMenuWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const rangeSheets = [];
  let key = null;
  wb.eachSheet((ws) => {
    if (isRangeSheet(ws)) {
      const parsed = readRangeSheet(ws);
      if (parsed.outlets.length && parsed.products.length) {
        rangeSheets.push({ name: ws.name, hidden: ws.state !== 'visible', ...parsed });
      }
    } else if (!key && isKeySheet(ws)) {
      key = { name: ws.name, rows: readKeySheet(ws) };
    }
  });

  return { rangeSheets, key };
}
