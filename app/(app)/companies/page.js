import { createClient } from '../../../lib/supabaseServer';
import { formatDate } from '../../../lib/formatDate';
import { NOT_RECORDED } from '../../../lib/engineerCompanies';

export const dynamic = 'force-dynamic';

// Which engineering firm attended, and how often — across all three things an
// engineer submits, so SCCI doing ten callouts counts as much as it should
// against EIT doing two installs.
//
// Records made before migration 035 carry no company, and there is no way to
// work one out after the fact. They're counted and shown as "Not recorded"
// rather than dropped: a supplier mix drawn from a third of the history, with
// no sign that's what it is, would be quietly wrong.
export default async function CompaniesPage({ searchParams }) {
  const params = (await searchParams) || {};
  const from = params.from || '';
  const to = params.to || '';
  const clientId = params.client || '';
  const hasFilters = Boolean(from || to || clientId);

  const supabase = await createClient();

  // The same scope on all three tables, so the totals describe one set of work.
  function scope(query) {
    let out = query.is('archived_at', null);
    if (clientId) out = out.eq('client_id', clientId);
    if (from) out = out.gte('submitted_at', from);
    // The picker gives a date; submitted_at is a timestamp, so without this a
    // "to" of today would exclude everything submitted today.
    if (to) out = out.lte('submitted_at', `${to}T23:59:59.999Z`);
    return out;
  }

  const [
    { data: surveys, error: surveyError },
    { data: installs, error: installError },
    { data: visits, error: visitError },
    { data: clients },
  ] = await Promise.all([
    scope(supabase.from('surveys').select('engineer_company, submitted_at')),
    scope(supabase.from('installations').select('engineer_company, submitted_at')),
    scope(supabase.from('visits').select('engineer_company, submitted_at')),
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
  ]);
  const error = surveyError || installError || visitError;

  const tally = new Map();
  function add(rows, kind) {
    (rows || []).forEach((r) => {
      const name = (r.engineer_company || '').trim() || NOT_RECORDED;
      const entry = tally.get(name) || { name, survey: 0, install: 0, visit: 0, total: 0, last: null };
      entry[kind] += 1;
      entry.total += 1;
      if (!entry.last || (r.submitted_at || '') > entry.last) entry.last = r.submitted_at;
      tally.set(name, entry);
    });
  }
  add(surveys, 'survey');
  add(installs, 'install');
  add(visits, 'visit');

  const rows = [...tally.values()].sort((a, b) => {
    // "Not recorded" is a gap in the data, not a supplier — it sits at the
    // bottom however big it gets.
    if (a.name === NOT_RECORDED) return 1;
    if (b.name === NOT_RECORDED) return -1;
    return b.total - a.total;
  });

  const grand = rows.reduce((n, r) => n + r.total, 0);
  const notRecorded = tally.get(NOT_RECORDED)?.total || 0;
  // Share is of the work we actually know the supplier for. Diluting it with
  // unrecorded records would make every firm look smaller than it is.
  const recorded = grand - notRecorded;
  const namedCompanies = rows.filter((r) => r.name !== NOT_RECORDED).length;

  return (
    <main>
      <div className="stats-strip">
        <div className="stat-tile">
          <div className="stat-value">{grand}</div>
          <div className="stat-label">{hasFilters ? 'Records Matching' : 'Records All Time'}</div>
          <div className="stat-note">Surveys, installs and visits</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{namedCompanies}</div>
          <div className="stat-label">Companies Used</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{notRecorded}</div>
          <div className="stat-label">Company Not Recorded</div>
          <div className="stat-note">Submitted before this was captured</div>
        </div>
      </div>

      <div className="panel" style={{ padding: '16px' }}>
        <h2>Engineer Companies</h2>
        <p className="hint">
          Who attended site, across surveys, install confirmations and engineer visits. The company
          is chosen on the form, so anything submitted before it existed shows as not recorded — fill
          those in by editing the record if you need the history to be complete.
        </p>
        <form className="filter-row" method="get">
          <select name="client" defaultValue={clientId}>
            <option value="">All Clients</option>
            {(clients || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input type="date" name="from" defaultValue={from} title="Submitted from" min="2000-01-01" max="2100-12-31" />
          <input type="date" name="to" defaultValue={to} title="Submitted to" min="2000-01-01" max="2100-12-31" />
          <button className="btn btn-primary" type="submit">Filter</button>
          {hasFilters && <a className="btn btn-ghost" href="/companies">Clear</a>}
        </form>
      </div>

      <div className="panel" style={{ padding: '12px 16px' }}>
        {error && <p className="error-text">Could not load records: {error.message}</p>}
        {!error && rows.length === 0 && (
          <div className="empty-state">
            {hasFilters ? 'Nothing submitted in that range.' : 'Nothing submitted yet.'}
          </div>
        )}
        {rows.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="num">Surveys</th>
                  <th className="num">Installs</th>
                  <th className="num">Visits</th>
                  <th className="num">Total</th>
                  <th>Share</th>
                  <th>Last used</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isGap = r.name === NOT_RECORDED;
                  const share = recorded > 0 && !isGap ? Math.round((r.total / recorded) * 100) : null;
                  return (
                    <tr key={r.name}>
                      <td className={isGap ? 'table-muted' : ''}>{r.name}</td>
                      <td className="num">{r.survey || <span className="table-muted">—</span>}</td>
                      <td className="num">{r.install || <span className="table-muted">—</span>}</td>
                      <td className="num">{r.visit || <span className="table-muted">—</span>}</td>
                      <td className="num">{r.total}</td>
                      <td>
                        {share === null ? (
                          <span className="table-muted">—</span>
                        ) : (
                          <>
                            <span className="mix-bar" aria-hidden="true">
                              <span className="mix-bar-fill" style={{ width: `${share}%` }} />
                            </span>
                            <span className="mix-share">{share}%</span>
                          </>
                        )}
                      </td>
                      <td>{r.last ? formatDate(r.last) : <span className="table-muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>All companies</td>
                  <td className="num">{(surveys || []).length}</td>
                  <td className="num">{(installs || []).length}</td>
                  <td className="num">{(visits || []).length}</td>
                  <td className="num">{grand}</td>
                  <td colSpan={2}>
                    {/* Stated rather than implied: the share column is a
                        percentage of this number, not of the grand total. */}
                    {recorded} record{recorded === 1 ? '' : 's'} with a company recorded
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
