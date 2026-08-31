// Server component — builds plain links that preserve the current filters/sort,
// so pagination works without any client-side JS.
function buildHref(basePath, params, page) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v && k !== 'page') search.set(k, v);
  });
  if (page > 1) search.set('page', String(page));
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({ basePath, params, page, pageSize, total }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="pagination no-print">
      <div className="pagination-info">
        Showing {first}&ndash;{last} of {total}
      </div>
      <div className="pagination-controls">
        {page > 1 ? (
          <a className="btn btn-ghost" href={buildHref(basePath, params, page - 1)}>Previous</a>
        ) : (
          <span className="btn btn-ghost disabled">Previous</span>
        )}
        <span className="pagination-page">Page {page} of {totalPages}</span>
        {page < totalPages ? (
          <a className="btn btn-ghost" href={buildHref(basePath, params, page + 1)}>Next</a>
        ) : (
          <span className="btn btn-ghost disabled">Next</span>
        )}
      </div>
    </div>
  );
}
