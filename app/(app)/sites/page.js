import { createClient } from '../../../lib/supabaseServer';
import { normalizeSiteName } from '../../../lib/siteName';
import { formatDateTime } from '../../../lib/formatDate';

export const dynamic = 'force-dynamic';

export default async function SitesPage({ searchParams }) {
  const params = (await searchParams) || {};
  const q = (params.q || '').trim().toLowerCase();

  const supabase = await createClient();

  const [
    { data: surveys, error: surveysError },
    { data: installations, error: installationsError },
    { data: visits, error: visitsError },
  ] = await Promise.all([
    supabase.from('surveys').select('site_location, submitted_at, clients(name)').is('archived_at', null),
    supabase.from('installations').select('site_location, submitted_at, clients(name)').is('archived_at', null),
    supabase.from('visits').select('site_location, submitted_at, clients(name)').is('archived_at', null),
  ]);
  const error = surveysError || installationsError || visitsError;

  const sites = new Map(); // normalized name -> { displayName, clientNames, counts, lastActivity }

  // Counts are keyed by type rather than branched — a two-way if/else would
  // silently miscount any type added later.
  function addEntry(row, type) {
    const norm = normalizeSiteName(row.site_location);
    if (!norm) return;
    if (!sites.has(norm)) {
      sites.set(norm, {
        displayName: row.site_location,
        clientNames: new Set(),
        counts: { survey: 0, installation: 0, visit: 0 },
        lastActivity: row.submitted_at,
      });
    }
    const entry = sites.get(norm);
    if (row.clients?.name) entry.clientNames.add(row.clients.name);
    entry.counts[type] += 1;
    if (new Date(row.submitted_at) > new Date(entry.lastActivity)) {
      entry.lastActivity = row.submitted_at;
      entry.displayName = row.site_location; // keep the most recent spelling as the canonical display
    }
  }

  (surveys || []).forEach((s) => addEntry(s, 'survey'));
  (installations || []).forEach((i) => addEntry(i, 'installation'));
  (visits || []).forEach((v) => addEntry(v, 'visit'));

  // Skip zero counts so a survey-only site doesn't read "1 survey · 0 installs · 0 visits".
  function countLabel(counts) {
    return [
      [counts.survey, 'survey', 'surveys'],
      [counts.installation, 'install', 'installs'],
      [counts.visit, 'visit', 'visits'],
    ]
      .filter(([n]) => n > 0)
      .map(([n, singular, plural]) => `${n} ${n === 1 ? singular : plural}`)
      .join(' · ');
  }

  let list = Array.from(sites.entries()).map(([norm, entry]) => ({ norm, ...entry }));
  if (q) list = list.filter((s) => s.displayName.toLowerCase().includes(q));
  list.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

  return (
    <main>
      <div className="panel" style={{ padding: '16px' }}>
        <h2>Site History</h2>
        <p className="hint">
          Every survey, install confirmation and engineer visit submitted for a site, grouped by
          site name — a quick way to see everything that's happened at a location. This is a text
          match on the name, not a real link between records.
        </p>
        <form className="filter-row" method="get">
          <input type="text" name="q" placeholder="Search site name…" defaultValue={params.q || ''} />
          <button className="btn btn-primary" type="submit">Filter</button>
          {q && <a className="btn btn-ghost" href="/sites">Clear</a>}
        </form>
      </div>

      <div className="panel" style={{ padding: '12px 16px' }}>
        {error && <p className="error-text">Could not load sites: {error.message}</p>}
        {!error && list.length === 0 && (
          <div className="empty-state">{q ? 'No sites match your search.' : 'Nothing submitted yet, or none of it is visible to your account.'}</div>
        )}
        {list.map((s) => (
          <a className="sub-row" key={s.norm} href={`/sites/${encodeURIComponent(s.norm)}`}>
            <div>
              <div className="site">
                {s.displayName || 'Untitled site'}
                {Array.from(s.clientNames).map((name) => <span className="client-badge" key={name}>{name}</span>)}
              </div>
              <div className="meta">Last activity {formatDateTime(s.lastActivity).slice(0, 10)}</div>
            </div>
            <div className="count">{countLabel(s.counts)}</div>
          </a>
        ))}
      </div>
    </main>
  );
}
