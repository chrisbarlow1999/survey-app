import { createClient } from '../../../../lib/supabaseServer';
import { normalizeSiteName } from '../../../../lib/siteName';
import { formatDate, formatDateTime } from '../../../../lib/formatDate';

export const dynamic = 'force-dynamic';

export default async function SiteHistoryPage({ params }) {
  const { name } = await params; // Next.js URL-decodes this automatically
  const supabase = await createClient();

  const [{ data: surveys, error: surveysError }, { data: installations, error: installationsError }] = await Promise.all([
    supabase
      .from('surveys')
      .select('id, site_location, engineer_first, engineer_last, survey_date, submitted_at, locations, clients(name)')
      .is('archived_at', null)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('installations')
      .select('id, site_location, engineer_first, engineer_last, install_date, submitted_at, locations, clients(name)')
      .is('archived_at', null)
      .order('submitted_at', { ascending: false }),
  ]);
  const error = surveysError || installationsError;

  const matchingSurveys = (surveys || []).filter((s) => normalizeSiteName(s.site_location) === name);
  const matchingInstalls = (installations || []).filter((i) => normalizeSiteName(i.site_location) === name);
  const displayName = matchingSurveys[0]?.site_location || matchingInstalls[0]?.site_location || name;

  return (
    <main>
      <a className="back-link" href="/sites">&larr; Back to Site History</a>
      <div className="panel" style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 20 }}>{displayName}</h2>
        <p className="hint">
          Everything submitted under this site name — a text match, not a real link between records.
        </p>
      </div>

      {error && (
        <div className="panel"><p className="error-text">Could not load history: {error.message}</p></div>
      )}

      {!error && matchingSurveys.length === 0 && matchingInstalls.length === 0 && (
        <div className="panel"><div className="empty-state">Nothing found for this site, or none of it is visible to your account.</div></div>
      )}

      {matchingSurveys.length > 0 && (
        <>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, margin: '20px 0 10px' }}>
            Surveys ({matchingSurveys.length})
          </h2>
          <div className="panel" style={{ padding: '12px 16px' }}>
            {matchingSurveys.map((s) => (
              <a className="sub-row" key={s.id} href={`/dashboard/${s.id}`}>
                <div>
                  <div className="site">{s.site_location}{s.clients?.name ? <span className="client-badge">{s.clients.name}</span> : null}</div>
                  <div className="meta">{s.engineer_first} {s.engineer_last} · {formatDate(s.survey_date)} · {formatDateTime(s.submitted_at)}</div>
                </div>
                <div className="count">{(s.locations || []).length} location{(s.locations || []).length !== 1 ? 's' : ''}</div>
              </a>
            ))}
          </div>
        </>
      )}

      {matchingInstalls.length > 0 && (
        <>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, margin: '20px 0 10px' }}>
            Installations ({matchingInstalls.length})
          </h2>
          <div className="panel" style={{ padding: '12px 16px' }}>
            {matchingInstalls.map((inst) => (
              <a className="sub-row" key={inst.id} href={`/installations/${inst.id}`}>
                <div>
                  <div className="site">{inst.site_location}{inst.clients?.name ? <span className="client-badge">{inst.clients.name}</span> : null}</div>
                  <div className="meta">{inst.engineer_first} {inst.engineer_last} · {formatDate(inst.install_date)} · {formatDateTime(inst.submitted_at)}</div>
                </div>
                <div className="count">{(inst.locations || []).length} screen{(inst.locations || []).length !== 1 ? 's' : ''}</div>
              </a>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
