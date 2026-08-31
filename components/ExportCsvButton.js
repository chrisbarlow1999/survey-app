'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { toCsv } from '../lib/toCsv';
import { SCREEN_SIZES } from '../lib/screenSizes';
import { formatDate, formatDateTime } from '../lib/formatDate';

// Fetches the full filtered set when clicked rather than exporting just the
// visible page — the list itself is paginated for performance, but an export
// that silently only covered page 1 would be worse than useless. RLS still
// applies, so this can only ever return rows the user can already see.

const SURVEY_HEADERS = [
  'Site Name', 'Client', 'Engineer First', 'Engineer Last', 'Phone', 'Survey Date',
  'Address', 'Site Contact', 'Engineer Days', 'Engineers Required', 'Additional Info', 'Submitted At',
  'Location #', 'Screen Size', 'Orientation', 'Mount Type', 'Measurements', 'Power Available', 'Data/4G Available', 'Notes',
];

const INSTALLATION_HEADERS = [
  'Site Name', 'Client', 'Engineer First', 'Engineer Last', 'Phone', 'Install Date',
  'Address', 'Site Contact', 'Additional Info', 'Signed By', 'Submitted At',
  'Screen #', 'Label', 'Installed', 'Notes',
];

function surveyRows(surveys) {
  const rows = [];
  for (const s of surveys) {
    const base = [
      s.site_location || '', s.clients?.name || '', s.engineer_first || '', s.engineer_last || '',
      s.phone || '', s.survey_date ? formatDate(s.survey_date) : '', s.address || '', s.site_contact || '',
      s.engineer_days ?? '', s.engineer_count ?? '', s.additional_info || '',
      s.submitted_at ? formatDateTime(s.submitted_at) : '',
    ];
    const locs = s.locations || [];
    if (locs.length === 0) {
      rows.push([...base, '', '', '', '', '', '', '', '']);
    } else {
      locs.forEach((loc, i) => {
        const sizeInfo = SCREEN_SIZES[loc.screen_size];
        rows.push([
          ...base,
          i + 1,
          sizeInfo ? sizeInfo.label : (loc.screen_size || ''),
          loc.orientation || '',
          loc.mount_type === 'Other' ? (loc.mount_type_other || 'Other') : (loc.mount_type || ''),
          loc.measurements || '',
          loc.power || '',
          loc.data_port || '',
          loc.notes || '',
        ]);
      });
    }
  }
  return rows;
}

function installationRows(installations) {
  const rows = [];
  for (const inst of installations) {
    const base = [
      inst.site_location || '', inst.clients?.name || '', inst.engineer_first || '', inst.engineer_last || '',
      inst.phone || '', inst.install_date ? formatDate(inst.install_date) : '', inst.address || '', inst.site_contact || '',
      inst.additional_info || '', inst.signed_by || '',
      inst.submitted_at ? formatDateTime(inst.submitted_at) : '',
    ];
    const locs = inst.locations || [];
    if (locs.length === 0) {
      rows.push([...base, '', '', '', '']);
    } else {
      locs.forEach((loc, i) => {
        rows.push([...base, i + 1, loc.label || '', loc.installed || '', loc.notes || '']);
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
};

export function ExportCsvButton({ kind, filters }) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const config = CONFIG[kind];

  async function handleExport() {
    setBusy(true);
    try {
      let query = supabase.from(config.table).select(config.select);
      query = filters.showArchived
        ? query.not('archived_at', 'is', null)
        : query.is('archived_at', null);
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
