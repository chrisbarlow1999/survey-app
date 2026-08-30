'use client';

import { toCsv } from '../lib/toCsv';

// Exports exactly what's already loaded on the page — since that data was
// fetched respecting whatever search/client/date filters are currently
// applied, the export naturally matches "what I'm looking at" with no extra
// wiring needed.
export function ExportCsvButton({ filename, headers, rows }) {
  function handleExport() {
    const csv = toCsv(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={handleExport} disabled={rows.length === 0}>
      Export CSV
    </button>
  );
}
