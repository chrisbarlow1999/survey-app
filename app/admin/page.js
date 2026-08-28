import { createClient } from '../../lib/supabaseServer';
import { UserPermissionsPanel } from '../../components/UserPermissionsPanel';
import { ClientManagementPanel } from '../../components/ClientManagementPanel';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
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

  const [{ data: profiles, error: profilesError }, { data: clients }, { data: grants }] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name, role, created_at').order('created_at', { ascending: true }),
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('profile_clients').select('profile_id, client_id'),
  ]);

  return (
    <main>
      <div className="panel" style={{ padding: '12px 16px' }}>
        <h2>Clients</h2>
        <p className="hint">
          Clients show up on the survey form's Client dropdown, and can be granted to accounts below.
          After adding one here, refresh the page to see it in the User Permissions list.
        </p>
        <ClientManagementPanel initialClients={clients || []} />
      </div>

      <div className="panel" style={{ padding: '12px 16px' }}>
        <h2>User Permissions</h2>
        <p className="hint">
          Super admins see every survey. Everyone else only sees the clients they're granted below.
        </p>
        {profilesError && <p className="error-text">Could not load users: {profilesError.message}</p>}
        {!profilesError && (
          <UserPermissionsPanel
            currentUserId={user.id}
            initialProfiles={profiles || []}
            clients={clients || []}
            initialGrants={grants || []}
          />
        )}
      </div>
    </main>
  );
}
