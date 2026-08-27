import { createClient } from '../../lib/supabaseServer';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: surveys, error } = await supabase
    .from('surveys')
    .select('id, site_location, engineer_first, engineer_last, survey_date, submitted_at, locations, clients(name)')
    .order('submitted_at', { ascending: false });

  return (
    <main>
      <div className="panel" style={{ padding: '12px 16px' }}>
        {error && <p className="error-text">Could not load surveys: {error.message}</p>}
        {!error && (!surveys || surveys.length === 0) && (
          <div className="empty-state">No surveys submitted yet, or none are visible to your account.</div>
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
