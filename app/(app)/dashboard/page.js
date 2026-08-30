import { createClient } from '../../../lib/supabaseServer';
import { computeStats } from '../../../lib/stats';
import { StatsStrip } from '../../../components/StatsStrip';
import { ExportCsvButton } from '../../../components/ExportCsvButton';
import { SCREEN_SIZES } from '../../../lib/screenSizes';

export const dynamic = 'force-dynamic';

const CSV_HEADERS = [
  'Site Name', 'Client', 'Engineer First', 'Engineer Last', 'Phone', 'Survey Date',
  'Address', 'Site Contact', 'Engineer Days', 'Engineers Required', 'Additional Info', 'Submitted At',
  'Location #', 'Screen Size', 'Orientation', 'Mount Type', 'Measurements', 'Power Available', 'Data/4G Available', 'Notes',
];

function surveyCsvRows(surveys) {
  const rows = [];
  for (const s of surveys) {
    const base = [
      s.site_location || '', s.clients?.name || '', s.engineer_first || '', s.engineer_last || '',
      s.phone || '', s.survey_date || '', s.address || '', s.site_contact || '',
      s.engineer_days ?? '', s.engineer_count ?? '', s.additional_info || '',
      s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '',
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

export default async function DashboardPage({ searchParams }) {
  const params = (await searchParams) || {};
  const q = (params.q || '').trim();
  const clientId = params.client || '';
  const from = params.from || '';
  const to = params.to || '';
  const hasFilters = Boolean(q || clientId || from || to);

  const supabase = await createClient();

  let query = supabase
    .from('surveys')
    .select('id, site_location, engineer_first, engineer_last, phone, survey_date, address, site_contact, engineer_days, engineer_count, additional_info, submitted_at, locations, client_id, clients(id, name)')
    .order('submitted_at', { ascending: false });

  if (clientId) query = query.eq('client_id', clientId);
  if (from) query = query.gte('survey_date', from);
  if (to) query = query.lte('survey_date', to);
  if (q) {
    const safeQ = q.replace(/[",()]/g, '');
    query = query.or(
      `site_location.ilike."%${safeQ}%",engineer_first.ilike."%${safeQ}%",engineer_last.ilike."%${safeQ}%"`
    );
  }

  const [{ data: surveys, error }, { data: clients }, { data: statsRows }] = await Promise.all([
    query,
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('surveys').select('submitted_at, clients(name)'),
  ]);

  const stats = computeStats(statsRows || []);

  return (
    <main>
      <StatsStrip total={stats.total} thisMonth={stats.thisMonth} clientStats={stats.clientStats} totalLabel="Total Surveys" monthLabel="This Month" />

      <div className="panel" style={{ padding: '16px' }}>
        <form className="filter-row" method="get">
          <input type="text" name="q" placeholder="Search site or engineer…" defaultValue={q} />
          <select name="client" defaultValue={clientId}>
            <option value="">All Clients</option>
            {(clients || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input type="date" name="from" defaultValue={from} title="From date" />
          <input type="date" name="to" defaultValue={to} title="To date" />
          <button className="btn btn-primary" type="submit">Filter</button>
          {hasFilters && <a className="btn btn-ghost" href="/dashboard">Clear</a>}
        </form>
      </div>

      <div className="panel" style={{ padding: '12px 16px' }}>
        <div className="toolbar" style={{ margin: '0 0 10px' }}>
          <ExportCsvButton
            filename={`surveys-export-${new Date().toISOString().slice(0, 10)}.csv`}
            headers={CSV_HEADERS}
            rows={surveyCsvRows(surveys || [])}
          />
        </div>
        {error && <p className="error-text">Could not load surveys: {error.message}</p>}
        {!error && (!surveys || surveys.length === 0) && (
          <div className="empty-state">{hasFilters ? 'No surveys match your filters.' : 'No surveys submitted yet, or none are visible to your account.'}</div>
        )}
        {surveys && surveys.map((s) => (
          <a className="sub-row" key={s.id} href={`/dashboard/${s.id}`}>
            <div>
              <div className="site">{s.site_location || 'Untitled site'}{s.clients?.name ? <span className="client-badge">{s.clients.name}</span> : null}</div>
              <div className="meta">{s.engineer_first} {s.engineer_last} · {s.survey_date} · {new Date(s.submitted_at).toLocaleString()}</div>
            </div>
            <div className="count">{(s.locations || []).length} location{(s.locations || []).length !== 1 ? 's' : ''}</div>
          </a>
        ))}
      </div>
    </main>
  );
}
