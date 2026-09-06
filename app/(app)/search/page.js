import { createClient } from '../../../lib/supabaseServer';
import { formatDate, formatDateTime } from '../../../lib/formatDate';
import { statusLabel, statusTone } from '../../../lib/projectStatus';
import { screenLabel } from '../../../lib/screenCount';

export const dynamic = 'force-dynamic';

// Enough to answer "is it in here, and where", not a replacement for the list
// pages — each section links through to its own list with the same search
// applied, which is where filtering, sorting and paging live.
const PER_SECTION = 6;

export default async function SearchPage({ searchParams }) {
  const params = (await searchParams) || {};
  const q = (params.q || '').trim();

  if (!q) {
    return (
      <main>
        <div className="panel">
          <h2>Search</h2>
          <p className="hint">
            Type in the box at the top of the sidebar to find a project, a site, or any survey,
            install or engineer visit — by site name, reference or engineer.
          </p>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  // PostgREST's or() takes a comma-separated filter list, so a comma, quote or
  // bracket in the search would break out of the expression. Same guard the
  // list pages use.
  const safe = q.replace(/[",()]/g, '');
  const like = `%${safe}%`;
  const recordMatch = `site_location.ilike."${like}",engineer_first.ilike."${like}",engineer_last.ilike."${like}"`;

  const [
    { data: projects },
    { data: surveys },
    { data: installs },
    { data: visits },
    { data: sites },
  ] = await Promise.all([
    // RLS does the access control on every one of these, so a client_viewer
    // searching gets their own client's records and no projects at all — the
    // sections simply come back empty rather than needing a role check here.
    supabase.from('projects')
      .select('id, title, reference, site_location, status, screen_count, clients(name)')
      .is('archived_at', null)
      .or(`title.ilike."${like}",reference.ilike."${like}",site_location.ilike."${like}"`)
      .order('created_at', { ascending: false }).limit(PER_SECTION),
    supabase.from('surveys')
      .select('id, site_location, survey_date, engineer_first, engineer_last, clients(name)')
      .is('archived_at', null).or(recordMatch)
      .order('submitted_at', { ascending: false }).limit(PER_SECTION),
    supabase.from('installations')
      .select('id, site_location, install_date, engineer_first, engineer_last, clients(name)')
      .is('archived_at', null).or(recordMatch)
      .order('submitted_at', { ascending: false }).limit(PER_SECTION),
    supabase.from('visits')
      .select('id, site_location, visit_date, engineer_first, engineer_last, clients(name)')
      .is('archived_at', null).or(recordMatch)
      .order('submitted_at', { ascending: false }).limit(PER_SECTION),
    // Reuses the same grouping function /sites is built on, so a site found
    // here is the same group you land on when you click it.
    supabase.rpc('site_summaries', { p_search: q, p_limit: PER_SECTION, p_offset: 0 }),
  ]);

  const sections = [
    {
      key: 'projects',
      title: 'Projects',
      all: `/projects?q=${encodeURIComponent(q)}`,
      rows: (projects || []).map((p) => ({
        id: p.id,
        href: `/projects/${p.id}`,
        name: p.title,
        client: p.clients?.name,
        meta: [p.reference, p.site_location, p.screen_count != null ? screenLabel(p.screen_count) : null]
          .filter(Boolean).join(' · ') || 'No site set',
        tail: <span className={`status-pill status-${statusTone(p.status)}`}>{statusLabel(p.status)}</span>,
      })),
    },
    {
      key: 'sites',
      title: 'Sites',
      all: `/sites?q=${encodeURIComponent(q)}`,
      rows: (sites || []).map((s) => ({
        id: s.site_key,
        href: `/sites/${encodeURIComponent(s.site_key)}`,
        name: s.display_name || 'Untitled site',
        client: (s.client_names || [])[0],
        meta: `Last activity ${formatDateTime(s.last_activity).slice(0, 10)}`,
        tail: `${s.total_count} record${Number(s.total_count) === 1 ? '' : 's'}`,
      })),
    },
    {
      key: 'surveys',
      title: 'Surveys',
      all: `/dashboard?q=${encodeURIComponent(q)}`,
      rows: (surveys || []).map((r) => ({
        id: r.id,
        href: `/dashboard/${r.id}`,
        name: r.site_location || 'Untitled site',
        client: r.clients?.name,
        meta: `${formatDate(r.survey_date)} · ${r.engineer_first || ''} ${r.engineer_last || ''}`.trim(),
        tail: 'Survey',
      })),
    },
    {
      key: 'installs',
      title: 'Installations',
      all: `/installations?q=${encodeURIComponent(q)}`,
      rows: (installs || []).map((r) => ({
        id: r.id,
        href: `/installations/${r.id}`,
        name: r.site_location || 'Untitled site',
        client: r.clients?.name,
        meta: `${formatDate(r.install_date)} · ${r.engineer_first || ''} ${r.engineer_last || ''}`.trim(),
        tail: 'Install',
      })),
    },
    {
      key: 'visits',
      title: 'Engineer Visits',
      all: `/visits?q=${encodeURIComponent(q)}`,
      rows: (visits || []).map((r) => ({
        id: r.id,
        href: `/visits/${r.id}`,
        name: r.site_location || 'Untitled site',
        client: r.clients?.name,
        meta: `${formatDate(r.visit_date)} · ${r.engineer_first || ''} ${r.engineer_last || ''}`.trim(),
        tail: 'Visit',
      })),
    },
  ];

  const withResults = sections.filter((s) => s.rows.length > 0);
  const total = withResults.reduce((n, s) => n + s.rows.length, 0);

  return (
    <main>
      <div className="panel" style={{ padding: '16px' }}>
        <h2>
          Results for &ldquo;{q}&rdquo;
          {total > 0 && <span className="panel-count">{total}</span>}
        </h2>
        <p className="hint">
          {total === 0
            ? 'Nothing matched, or none of it is visible to your account.'
            : 'The first few of each. Follow a heading through to the full list to filter and page.'}
        </p>
        <form className="filter-row" method="get" style={{ marginTop: 12 }}>
          <input type="text" name="q" defaultValue={q} placeholder="Search everything…" />
          <button className="btn btn-primary" type="submit">Search</button>
        </form>
      </div>

      {withResults.map((section) => (
        <div className="panel" style={{ padding: '12px 16px' }} key={section.key}>
          <h2 style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            {section.title}
            <span className="panel-count">{section.rows.length}</span>
            {/* Capped at six, so there may well be more — the link is how you
                get to the rest rather than a decoration. */}
            <a className="search-all" href={section.all}>
              {section.rows.length === PER_SECTION ? 'See all matches' : 'Open list'}
            </a>
          </h2>
          {section.rows.map((row) => (
            <a className="sub-row" key={`${section.key}-${row.id}`} href={row.href}>
              <div>
                <div className="site">
                  {row.name}
                  {row.client ? <span className="client-badge">{row.client}</span> : null}
                </div>
                <div className="meta">{row.meta}</div>
              </div>
              <div className="count">{row.tail}</div>
            </a>
          ))}
        </div>
      ))}
    </main>
  );
}
