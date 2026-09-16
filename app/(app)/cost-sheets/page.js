import { createClient } from '../../../lib/supabaseServer';
import { formatDate } from '../../../lib/formatDate';
import { formatGBP, formatGBPShort } from '../../../lib/money';
import { Pagination } from '../../../components/Pagination';
import { PAGE_SIZE, parsePage } from '../../../lib/listQuery';
import { ArchiveFilter, applyArchiveFilter } from '../../../components/ArchiveFilter';
import { COST_SHEET_STATUS, costSheetLabel, costSheetTone } from '../../../lib/costSheetStatus';

export const dynamic = 'force-dynamic';


// Every quote, with the money on show. Internal staff only — a cost sheet
// carries our cost and our margin, so client_viewer accounts are refused by
// RLS rather than merely not linked here.
export default async function CostSheetsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const clientId = params.client || '';
  const status = params.status || '';
  const archived = params.archived || '';
  const page = parsePage(params.page);
  const hasFilters = Boolean(clientId || status || archived);

  const supabase = await createClient();

  let query = supabase
    .from('cost_sheets')
    .select(
      'id, reference, title, total_cost, total_price, approval_status, created_at, archived_at, client_id, clients(name), surveys(site_location, survey_date)',
      { count: 'exact' }
    );

  query = applyArchiveFilter(query, archived);
  if (clientId) query = query.eq('client_id', clientId);
  if (status) query = query.eq('approval_status', status);
  query = query
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [{ data: sheets, error, count }, { data: clients }, { data: openRows }] = await Promise.all([
    query,
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    // Totals across live sheets, not just this page. Cancelled work would
    // flatter the figure, so anything withdrawn or archived is left out.
    supabase.from('cost_sheets').select('total_price, total_cost, approval_status').is('archived_at', null),
  ]);

  const live = (openRows || []).filter((r) => r.approval_status !== 'not_sent');
  const approved = (openRows || []).filter((r) => r.approval_status === 'approved');
  const sum = (rows, field) => rows.reduce((n, r) => n + (Number(r[field]) || 0), 0);
  const awaiting = live.filter((r) => r.approval_status === 'awaiting');
  const outValue = sum(awaiting, 'total_price');
  const approvedValue = sum(approved, 'total_price');
  const approvedMargin = approvedValue - sum(approved, 'total_cost');

  return (
    <main>
      <div className="stats-strip">
        <div className="stat-tile">
          <div className="stat-value">{awaiting.length > 0 ? formatGBPShort(outValue) : '—'}</div>
          <div className="stat-label">Out With Clients</div>
          <div className="stat-note">Sent, not yet answered</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{approved.length > 0 ? formatGBPShort(approvedValue) : '—'}</div>
          <div className="stat-label">Approved</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{approved.length > 0 ? formatGBPShort(approvedMargin) : '—'}</div>
          <div className="stat-label">Approved Margin</div>
          <div className="stat-note">Sell less cost, ex VAT</div>
        </div>
      </div>

      <div className="panel" style={{ padding: '16px' }}>
        <h2>Cost Sheets</h2>
        <p className="hint">
          Quotes built from surveys. A sheet is a draft until you send it; once a client has
          approved one, that&apos;s the figure the job was won at.
        </p>
        <form className="filter-row" method="get">
          <select name="client" defaultValue={clientId}>
            <option value="">All Clients</option>
            {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="status" defaultValue={status}>
            <option value="">All Statuses</option>
            {Object.entries(COST_SHEET_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <ArchiveFilter value={archived} />
          <button className="btn btn-primary" type="submit">Filter</button>
          {hasFilters && <a className="btn btn-ghost" href="/cost-sheets">Clear</a>}
        </form>
      </div>

      <div className="panel" style={{ padding: '12px 16px' }}>
        {error && <p className="error-text">Could not load cost sheets: {error.message}</p>}
        {!error && (!sheets || sheets.length === 0) && (
          <div className="empty-state">
            {hasFilters
              ? 'No cost sheets match those filters.'
              : 'No cost sheets yet. Open a survey and use “Create cost sheet” to build one from it.'}
          </div>
        )}
        {(sheets || []).map((s) => (
          <a className="sub-row" key={s.id} href={`/cost-sheets/${s.id}`}>
            <div>
              <div className="site">
                {s.title || s.surveys?.site_location || 'Untitled sheet'}
                {s.clients?.name ? <span className="client-badge">{s.clients.name}</span> : null}
                {s.archived_at ? <span className="client-badge archived-badge">Archived</span> : null}
              </div>
              <div className="meta">
                {s.reference ? `${s.reference} · ` : ''}
                {s.surveys?.site_location || 'No site'}
                {` · raised ${formatDate(s.created_at)}`}
              </div>
            </div>
            <div className="count">
              <span className={`status-pill status-${costSheetTone(s.approval_status)}`}>
                {costSheetLabel(s.approval_status)}
              </span>
              <span className="schedule-screens">{formatGBP(s.total_price)}</span>
            </div>
          </a>
        ))}
        <Pagination basePath="/cost-sheets" params={params} page={page} pageSize={PAGE_SIZE} total={count || 0} />
      </div>
    </main>
  );
}
