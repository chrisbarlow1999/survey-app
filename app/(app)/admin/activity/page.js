import { createClient } from '../../../../lib/supabaseServer';
import { formatDateTime } from '../../../../lib/formatDate';

export const dynamic = 'force-dynamic';

const ACTION_LABELS = {
  create_account: 'created account',
  rename_account: 'renamed account to',
  reset_password: 'reset password for',
  change_role: 'changed role for',
  deactivate_account: 'deactivated',
  reactivate_account: 'reactivated',
  grant_client_access: 'granted client access to',
  revoke_client_access: 'revoked client access from',
  create_client: 'added client',
  rename_client: 'renamed client',
  delete_client: 'deleted client',
};

function describe(entry) {
  const label = ACTION_LABELS[entry.action] || entry.action;
  const d = entry.details || {};
  let extra = '';
  if (entry.action === 'change_role' && d.from && d.to) extra = ` (${d.from} → ${d.to})`;
  if ((entry.action === 'grant_client_access' || entry.action === 'revoke_client_access') && d.client_name) extra = ` — ${d.client_name}`;
  if ((entry.action === 'rename_client' || entry.action === 'rename_account') && d.from) extra = ` (was "${d.from}")`;
  if (entry.action === 'create_account' && d.role) extra = ` (${d.role})`;
  return `${label} ${entry.target || ''}${extra}`;
}

export default async function AdminActivityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (myProfile?.role !== 'super_admin') {
    return (
      <main>
        <div className="empty-state">You don't have permission to view this page.</div>
      </main>
    );
  }

  const { data: entries, error } = await supabase
    .from('admin_actions')
    .select('id, action, target, details, created_at, actor:profiles(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <main>
      <div className="panel" style={{ padding: '12px 16px' }}>
        <h2>Admin Activity</h2>
        <p className="hint">
          A record of account and client management actions — who did what, and when. Most recent 200 shown.
        </p>
        {error && <p className="error-text">Could not load activity: {error.message}</p>}
        {!error && (!entries || entries.length === 0) && (
          <div className="empty-state">No admin activity recorded yet.</div>
        )}
        {entries && entries.length > 0 && (
          <div className="edit-history" style={{ borderTop: 'none', paddingTop: 0 }}>
            <ul>
              {entries.map((e) => (
                <li key={e.id}>
                  <span style={{ color: 'var(--text-primary)' }}>{e.actor?.full_name || e.actor?.email || 'Unknown'}</span>
                  {' '}{describe(e)} — {formatDateTime(e.created_at)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
