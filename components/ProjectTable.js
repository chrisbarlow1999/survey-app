import { formatDate } from '../lib/formatDate';
import { statusLabel, statusTone } from '../lib/projectStatus';
import { resolveProjectSort } from '../lib/listQuery';
import { screenTotals } from '../lib/screenCount';

// The dense management read on the pipeline: one row per project, the columns
// you'd want in a spreadsheet, sortable by clicking a heading.
//
// Deliberately a server component. Sorting is a link that reloads with a new
// ?sort= rather than client-side state, so the URL is the whole view — a sorted
// filtered table can be bookmarked, shared in Teams, or refreshed without
// losing where you were. It also means the sort matches what the CSV export
// produces, because both go through resolveProjectSort.

// Each sortable column and the sort keys it cycles through, with the arrow that
// belongs to each. The arrow can't be derived from position: "most screens
// first" is the useful default for screens but "soonest" is for dates.
//
// Stage is deliberately absent: ordering by the status column would sort the
// raw keys alphabetically — cancelled, complete, designs, estimating — which
// isn't the workflow. Ordering by workflow position would mean storing that
// position in the database, and lib/projectStatus.js keeps it in JS on purpose
// so the stages can be reshaped without a migration. The Stage filter and the
// Board view already answer "what's sitting at this stage".
const COLS = {
  title: [{ v: 'title_az', a: '↑' }, { v: 'title_za', a: '↓' }],
  screens: [{ v: 'screens_desc', a: '↓' }, { v: 'screens_asc', a: '↑' }],
  install: [{ v: 'install_asc', a: '↑' }, { v: 'install_desc', a: '↓' }],
  due: [{ v: 'due_asc', a: '↑' }, { v: 'due_desc', a: '↓' }],
  created: [{ v: 'newest', a: '↓' }, { v: 'oldest', a: '↑' }],
};

// Carries the filters but drops page — a re-sorted list has a different page 4.
function sortHref(basePath, params, value) {
  const sp = new URLSearchParams();
  ['q', 'client', 'status', 'owner', 'archived'].forEach((k) => {
    if (params?.[k]) sp.set(k, params[k]);
  });
  sp.set('sort', value);
  return `${basePath}?${sp.toString()}`;
}

function SortHeader({ label, col, params, basePath, className }) {
  const opts = COLS[col];
  const current = resolveProjectSort(params?.sort).value;
  const i = opts.findIndex((o) => o.v === current);
  // Clicking the active column flips it; clicking a new one starts at its
  // natural direction.
  const next = i === -1 ? opts[0] : opts[(i + 1) % opts.length];
  return (
    <th className={className} aria-sort={i > -1 ? (opts[i].a === '↑' ? 'ascending' : 'descending') : 'none'}>
      <a className={`th-sort${i > -1 ? ' on' : ''}`} href={sortHref(basePath, params, next.v)}>
        {label}
        <span className="th-arrow">{i > -1 ? opts[i].a : ''}</span>
      </a>
    </th>
  );
}

export function ProjectTable({ projects, params, basePath, today }) {
  const rows = projects || [];
  const pageScreens = screenTotals(rows);

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <SortHeader label="Project" col="title" params={params} basePath={basePath} />
            <th>Client</th>
            <th>Stage</th>
            <th>Owner</th>
            <SortHeader label="Screens" col="screens" params={params} basePath={basePath} className="num" />
            <SortHeader label="Install" col="install" params={params} basePath={basePath} />
            <SortHeader label="Due" col="due" params={params} basePath={basePath} />
            <th className="num">Tasks</th>
            <SortHeader label="Raised" col="created" params={params} basePath={basePath} />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            // Only chase a date on work that's still live — a completed job
            // whose install date has passed is not late.
            const live = !['complete', 'cancelled'].includes(p.status);
            const dueLate = live && p.due_date && p.due_date < today;
            const installLate = live && p.install_date && p.install_date < today;
            return (
              <tr key={p.id}>
                <td>
                  <a className="table-title" href={`/projects/${p.id}`}>{p.title}</a>
                  {(p.reference || p.site_location) && (
                    <div className="table-sub">
                      {[p.reference, p.site_location].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </td>
                <td>{p.clients?.name || '—'}</td>
                <td>
                  <span className={`status-pill status-${statusTone(p.status)}`}>{statusLabel(p.status)}</span>
                </td>
                <td>{p.owner?.full_name || p.owner?.email || <span className="table-muted">Unassigned</span>}</td>
                {/* Blank, not 0, when unestimated — see lib/screenCount.js. */}
                <td className="num">
                  {p.screen_count == null ? <span className="table-muted">—</span> : p.screen_count}
                </td>
                <td className={installLate ? 'table-late' : ''}>
                  {p.install_date ? formatDate(p.install_date) : <span className="table-muted">—</span>}
                </td>
                <td className={dueLate ? 'table-late' : ''}>
                  {p.due_date ? formatDate(p.due_date) : <span className="table-muted">—</span>}
                </td>
                <td className="num">
                  {p.taskTotal > 0
                    ? <span className={p.taskDone === p.taskTotal ? 'table-done' : ''}>{p.taskDone}/{p.taskTotal}</span>
                    : <span className="table-muted">—</span>}
                </td>
                <td>{formatDate(p.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              {/* Says "this page" on purpose. The figure for the whole filtered
                  set is in the strip above — a footer total that silently meant
                  only 25 of 80 projects would be read as the real number. */}
              <td colSpan={4}>This page ({rows.length} project{rows.length === 1 ? '' : 's'})</td>
              <td className="num">{pageScreens.total}</td>
              <td colSpan={4}>
                {pageScreens.unestimated > 0
                  ? `${pageScreens.unestimated} without a screen estimate`
                  : ''}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
