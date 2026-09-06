import { ArchiveFilter } from './ArchiveFilter';
import { PROJECT_STATUSES } from '../lib/projectStatus';
import { PROJECT_SORT_OPTIONS, resolveProjectSort } from '../lib/listQuery';

// The filter bar shared by the List and Table views. Pulled out when the second
// view arrived — two hand-maintained copies of the same six controls is how a
// filter quietly stops working on one page and nobody notices.
//
// A GET form with no action submits to the current URL, so this filters in
// place on whichever view is showing it. `page` is deliberately not carried:
// changing a filter should land you on page 1, not on page 4 of a different
// result set.
// showSort is off for the views that impose their own order — a Sort dropdown
// on a calendar would be a control that does nothing.
export function ProjectFilters({ params, clients, owners, basePath, showSort = true }) {
  const q = (params?.q || '').trim();
  const clientId = params?.client || '';
  const status = params?.status || '';
  const owner = params?.owner || '';
  const archived = params?.archived || '';
  const sort = resolveProjectSort(params?.sort);
  const hasFilters = Boolean(q || clientId || status || owner || archived || params?.sort);

  return (
    <div className="panel" style={{ padding: '16px' }}>
      <form className="filter-row" method="get">
        <input type="text" name="q" placeholder="Search title, reference or site…" defaultValue={q} />
        <select name="client" defaultValue={clientId}>
          <option value="">All Clients</option>
          {(clients || []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={status}>
          <option value="">All Statuses</option>
          {PROJECT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select name="owner" defaultValue={owner} title="Owner">
          <option value="">All Owners</option>
          <option value="none">Unassigned</option>
          {(owners || []).map((o) => (
            <option key={o.id} value={o.id}>{o.full_name || o.email}</option>
          ))}
        </select>
        {showSort && (
          <select name="sort" defaultValue={sort.value} title="Sort by">
            {PROJECT_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <ArchiveFilter value={archived} />
        <button className="btn btn-primary" type="submit">Filter</button>
        {hasFilters && <a className="btn btn-ghost" href={basePath}>Clear</a>}
      </form>
    </div>
  );
}
