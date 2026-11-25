import { createClient } from '../../../../lib/supabaseServer';
import { RequestLinkList } from '../../../../components/RequestLinkList';

export const dynamic = 'force-dynamic';

// Open to every internal account. Staff see the clients they've been granted
// and can copy or preview their links; only super admins can open or close a
// form (the clients table only lets super admins update it — migration 006).
export default async function AdminRequestLinksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = myProfile?.role;

  if (role !== 'super_admin' && role !== 'user') {
    return (
      <main>
        <div className="empty-state">You don't have permission to view this page.</div>
      </main>
    );
  }
  const isSuperAdmin = role === 'super_admin';

  const [{ data: clients }, { data: intakeProjects }, { data: grants }] = await Promise.all([
    supabase.from('clients').select('id, name, slug, intake_enabled').order('name', { ascending: true }),
    // Counted in memory rather than with a grouped query: PostgREST has no
    // group-by, and the number of intake projects is small enough that pulling
    // two columns is cheaper than a view. Revisit if this ever gets slow.
    supabase.from('projects').select('client_id, created_at').eq('source', 'intake'),
    // A staff member's own client grants (readable once migration 049 has run).
    isSuperAdmin ? Promise.resolve({ data: null }) : supabase.from('profile_clients').select('client_id').eq('profile_id', user.id),
  ]);

  const allowed = grants ? new Set(grants.map((g) => g.client_id)) : null;
  const visible = (clients || []).filter((c) => !allowed || allowed.has(c.id));

  const stats = {};
  (intakeProjects || []).forEach((p) => {
    const s = stats[p.client_id] || { count: 0, last: null };
    s.count += 1;
    if (!s.last || p.created_at > s.last) s.last = p.created_at;
    stats[p.client_id] = s;
  });

  const rows = visible.map((c) => ({
    ...c,
    requestCount: stats[c.id]?.count || 0,
    lastRequestAt: stats[c.id]?.last || null,
  }));

  const liveCount = rows.filter((r) => r.intake_enabled).length;
  const openSummary = liveCount === 0 ? 'No forms are open at the moment.' : `${liveCount} of ${rows.length} are open.`;

  return (
    <main>
      <div className="panel" style={{ padding: '12px 16px' }}>
        <h2>Request Links</h2>
        <p className="hint">
          Every client's own request form. Send a client their link and they can raise a project
          without an account — it lands in Projects tagged as a Request. {openSummary}{' '}
          {isSuperAdmin
            ? 'Turning one off closes the form immediately; the link is kept so you can reopen it later.'
            : 'Only a super admin can open or close a form — ask one if a client needs theirs switched on.'}
        </p>
        <RequestLinkList rows={rows} isSuperAdmin={isSuperAdmin} />
      </div>
    </main>
  );
}
