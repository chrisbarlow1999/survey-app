import { createClient } from '../../../../lib/supabaseServer';
import { RequestLinkList } from '../../../../components/RequestLinkList';

export const dynamic = 'force-dynamic';

export default async function AdminRequestLinksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  if (myProfile?.role !== 'super_admin') {
    return (
      <main>
        <div className="empty-state">You don't have permission to view this page.</div>
      </main>
    );
  }

  const [{ data: clients }, { data: intakeProjects }] = await Promise.all([
    supabase.from('clients').select('id, name, slug, intake_enabled').order('name', { ascending: true }),
    // Counted in memory rather than with a grouped query: PostgREST has no
    // group-by, and the number of intake projects is small enough that pulling
    // two columns is cheaper than a view. Revisit if this ever gets slow.
    supabase.from('projects').select('client_id, created_at').eq('source', 'intake'),
  ]);

  const stats = {};
  (intakeProjects || []).forEach((p) => {
    const s = stats[p.client_id] || { count: 0, last: null };
    s.count += 1;
    if (!s.last || p.created_at > s.last) s.last = p.created_at;
    stats[p.client_id] = s;
  });

  const rows = (clients || []).map((c) => ({
    ...c,
    requestCount: stats[c.id]?.count || 0,
    lastRequestAt: stats[c.id]?.last || null,
  }));

  const liveCount = rows.filter((r) => r.intake_enabled).length;

  return (
    <main>
      <div className="panel" style={{ padding: '12px 16px' }}>
        <h2>Request Links</h2>
        <p className="hint">
          Every client's own request form. Send a client their link and they can raise a project
          without an account — it lands in Projects tagged as a Request. {liveCount === 0
            ? 'No forms are open at the moment.'
            : `${liveCount} of ${rows.length} are open.`} Turning one off closes the form
          immediately; the link is kept so you can reopen it later.
        </p>
        <RequestLinkList rows={rows} />
      </div>
    </main>
  );
}
