'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { toCsv } from '../lib/toCsv';
import { SCREEN_SIZES } from '../lib/screenSizes';
import { formatDate, formatDateTime } from '../lib/formatDate';
import { applyArchiveFilter } from './ArchiveFilter';

// Fetches the full filtered set when clicked rather than exporting just the
// visible page — the list itself is paginated for performance, but an export
// that silently only covered page 1 would be worse than useless. RLS still
// applies, so this can only ever return rows the user can already see.

const SURVEY_HEADERS = [
  'Site Name', 'Client', 'Engineer First', 'Engineer Last', 'Phone', 'Survey Date',
  'Address', 'Site Contact', 'Engineer Days', 'Engineers Required', 'Additional Info', 'Submitted At',
  'Area #', 'Area Name', 'Screen Size', 'Orientation', 'Mount Type', 'Measurements',
  'Screen #', 'Power Available', 'Data/4G Available', 'Notes',
];

const INSTALLATION_HEADERS = [
  'Site Name', 'Client', 'Engineer First', 'Engineer Last', 'Phone', 'Install Date',
  'Address', 'Site Contact', 'Additional Info', 'Signed By', 'Submitted At',
  'Area #', 'Area Name', 'Screen #', 'Installed', 'Notes',
];

const VISIT_HEADERS = [
  'Site Name', 'Client', 'Engineer First', 'Engineer Last', 'Phone', 'Visit Date',
  'Address', 'Site Contact', 'Additional Info', 'Signed', 'Submitted At',
  'Issue #', 'Issue', 'Resolved', 'Fix / Work Done',
];

// One row per screen, so an area with three screens produces three lines with
// the area columns repeated — that's what makes the export pivotable.
function surveyRows(surveys) {
  const rows = [];
  for (const s of surveys) {
    const base = [
      s.site_location || '', s.clients?.name || '', s.engineer_first || '', s.engineer_last || '',
      s.phone || '', s.survey_date ? formatDate(s.survey_date) : '', s.address || '', s.site_contact || '',
      s.engineer_days ?? '', s.engineer_count ?? '', s.additional_info || '',
      s.submitted_at ? formatDateTime(s.submitted_at) : '',
    ];
    const areas = s.locations || [];
    if (areas.length === 0) {
      rows.push([...base, '', '', '', '', '', '', '', '', '', '']);
      continue;
    }
    areas.forEach((area, i) => {
      const sizeInfo = SCREEN_SIZES[area.screen_size];
      const areaCols = [
        i + 1,
        area.area_name || '',
        sizeInfo ? sizeInfo.label : (area.screen_size || ''),
        area.orientation || '',
        area.mount_type === 'Other' ? (area.mount_type_other || 'Other') : (area.mount_type || ''),
        area.measurements || '',
      ];
      const screens = area.screens || [];
      if (screens.length === 0) {
        rows.push([...base, ...areaCols, '', '', '', '']);
        return;
      }
      screens.forEach((screen, si) => {
        rows.push([
          ...base, ...areaCols,
          si + 1,
          screen.power || '',
          screen.data_port || '',
          screen.notes || '',
        ]);
      });
    });
  }
  return rows;
}

// One row per installed screen, matching the survey export's shape.
function installationRows(installations) {
  const rows = [];
  for (const inst of installations) {
    const base = [
      inst.site_location || '', inst.clients?.name || '', inst.engineer_first || '', inst.engineer_last || '',
      inst.phone || '', inst.install_date ? formatDate(inst.install_date) : '', inst.address || '', inst.site_contact || '',
      inst.additional_info || '', inst.signed_by || '',
      inst.submitted_at ? formatDateTime(inst.submitted_at) : '',
    ];
    const areas = inst.locations || [];
    if (areas.length === 0) {
      rows.push([...base, '', '', '', '', '']);
      continue;
    }
    areas.forEach((area, i) => {
      const areaCols = [i + 1, area.area_name || ''];
      const screens = area.screens || [];
      if (screens.length === 0) {
        rows.push([...base, ...areaCols, '', '', '']);
        return;
      }
      screens.forEach((screen, si) => {
        rows.push([...base, ...areaCols, si + 1, screen.installed || '', screen.notes || '']);
      });
    });
  }
  return rows;
}

function visitRows(visits) {
  const rows = [];
  for (const v of visits) {
    const base = [
      v.site_location || '', v.clients?.name || '', v.engineer_first || '', v.engineer_last || '',
      v.phone || '', v.visit_date ? formatDate(v.visit_date) : '', v.address || '', v.site_contact || '',
      v.additional_info || '', v.signature_path ? 'Yes' : 'No',
      v.submitted_at ? formatDateTime(v.submitted_at) : '',
    ];
    const issues = v.issues || [];
    if (issues.length === 0) {
      rows.push([...base, '', '', '', '']);
    } else {
      issues.forEach((issue, i) => {
        rows.push([...base, i + 1, issue.title || '', issue.resolved || '', issue.fix || '']);
      });
    }
  }
  return rows;
}

const CONFIG = {
  surveys: {
    table: 'surveys',
    dateColumn: 'survey_date',
    headers: SURVEY_HEADERS,
    buildRows: surveyRows,
    select: 'site_location, engineer_first, engineer_last, phone, survey_date, address, site_contact, engineer_days, engineer_count, additional_info, submitted_at, locations, clients(name)',
  },
  installations: {
    table: 'installations',
    dateColumn: 'install_date',
    headers: INSTALLATION_HEADERS,
    buildRows: installationRows,
    select: 'site_location, engineer_first, engineer_last, phone, install_date, address, site_contact, additional_info, signed_by, submitted_at, locations, clients(name)',
  },
  visits: {
    table: 'visits',
    dateColumn: 'visit_date',
    headers: VISIT_HEADERS,
    buildRows: visitRows,
    // Photo paths are deliberately omitted — signed URLs expire in an hour, so
    // a column of them would be worse than nothing.
    select: 'site_location, engineer_first, engineer_last, phone, visit_date, address, site_contact, additional_info, signature_path, submitted_at, issues, clients(name)',
  },
};

export function ExportCsvButton({ kind, filters }) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const config = CONFIG[kind];

  async function handleExport() {
    setBusy(true);
    try {
      let query = applyArchiveFilter(supabase.from(config.table).select(config.select), filters.archived);
      if (filters.clientId) query = query.eq('client_id', filters.clientId);
      if (filters.from) query = query.gte(config.dateColumn, filters.from);
      if (filters.to) query = query.lte(config.dateColumn, filters.to);
      if (filters.q) {
        const safeQ = filters.q.replace(/[",()]/g, '');
        query = query.or(
          `site_location.ilike."%${safeQ}%",engineer_first.ilike."%${safeQ}%",engineer_last.ilike."%${safeQ}%"`
        );
      }
      query = query.order('submitted_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) {
        alert('Nothing to export for the current filters.');
        setBusy(false);
        return;
      }

      const csv = toCsv(config.headers, config.buildRows(data));
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kind}-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Could not export. Please try again.');
    }
    setBusy(false);
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={handleExport} disabled={busy}>
      {busy ? 'Exporting…' : 'Export CSV'}
    </button>
  );
}
