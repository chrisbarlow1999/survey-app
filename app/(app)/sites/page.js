import { createClient } from '../../../lib/supabaseServer';
import { formatDateTime } from '../../../lib/formatDate';
import { Pagination } from '../../../components/Pagination';
import { PAGE_SIZE, parsePage } from '../../../lib/listQuery';

export const dynamic = 'force-dynamic';

// Skip zero counts so a survey-only site doesn't read "1 survey · 0 installs · 0 visits".
function countLabel(row) {
  return [
    [Number(row.survey_count), 'survey', 'surveys'],
    [Number(row.install_count), 'install', 'installs'],
    [Number(row.visit_count), 'visit', 'visits'],
  ]
    .filter(([n]) => n > 0)
    .map(([n, singular, plural]) => `${n} ${n === 1 ? singular : plural}`)
    .join(' · ');
}

export default async function SitesPage({ searchParams }) {
  const params = (await searchParams) || {};
  const q = (params.q || '').trim();
  const page = parsePage(params.page);

  const supabase = await createClient();

  // Grouping and paging happen in Postgres (migration 028). This page used to
  // pull every row of all three tables and group them in JavaScript, which was
  // always going to be the first thing to slow down as history built up.
  //
  // Both functions are security INVOKER, so RLS still filters each underlying
  // table by client access — a definer function here would have shown every
  // client's sites to everyone.
  const [{ data: rows, error }, { data: total, error: countError }] = await Promise.all([
    supabase.rpc('site_summaries', {
      p_search: q || null,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.rpc('site_summaries_count', { p_search: q || null }),
  ]);

  const list = rows || [];
  const failed = error || countError;

  return (
    <main>
      <div className="panel" style={{ padding: '16px' }}>
        <h2>Site History</h2>
        <p className="hint">
          Every survey, install confirmation and engineer visit submitted for a site, grouped by
          site name — a quick way to see everything that&apos;s happened at a location. This is a text
          match on the name, not a real link between records.
        </p>
        <form className="filter-row" method="get">
          <input type="text" name="q" placeholder="Search site or client…" defaultValue={q} />
          <button className="btn btn-primary" type="submit">Filter</button>
          {q && <a className="btn btn-ghost" href="/sites">Clear</a>}
        </form>
      </div>

      <div className="panel" style={{ padding: '12px 16px' }}>
        {failed && <p className="error-text">Could not load sites: {failed.message}</p>}
        {!failed && list.length === 0 && (
          <div className="empty-state">
            {q ? 'No sites match your search.' : 'Nothing submitted yet, or none of it is visible to your account.'}
          </div>
        )}
        {list.map((s) => (
          <a className="sub-row" key={s.site_key} href={`/sites/${encodeURIComponent(s.site_key)}`}>
            <div>
              <div className="site">
                {s.display_name || 'Untitled site'}
                {/* A site can have records under more than one client, so show
                    every one rather than picking a winner. */}
                {(s.client_names || []).map((name) => (
                  <span className="client-badge" key={name}>{name}</span>
                ))}
              </div>
              <div className="meta">Last activity {formatDateTime(s.last_activity).slice(0, 10)}</div>
            </div>
            <div className="count">{countLabel(s)}</div>
          </a>
        ))}
        <Pagination
          basePath="/sites"
          params={params}
          page={page}
          pageSize={PAGE_SIZE}
          total={Number(total) || 0}
        />
      </div>
    </main>
  );
}
