import { createClient } from '../../../../lib/supabaseServer';
import { UserPermissionsPanel } from '../../../../components/UserPermissionsPanel';
import { CreateUserForm } from '../../../../components/CreateUserForm';

export const dynamic = 'force-dynamic';

export default async function AdminAccountsPage() {
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
    supabase.from('profiles').select('id, email, full_name, role, active, created_at').order('created_at', { ascending: true }),
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('profile_clients').select('profile_id, client_id'),
  ]);

  return (
    <main>
      <div className="panel" style={{ padding: '12px 16px' }}>
        <h2>Create Account</h2>
        <p className="hint">
          There's no public sign-up — every account is created here. Set a role and, for regular
          users, which clients they can see. A one-time password is shown once after creation for
          you to pass on directly.
        </p>
        <CreateUserForm clients={clients || []} />
      </div>

      <div className="panel" style={{ padding: '12px 16px' }}>
        <h2>User Permissions</h2>
        <p className="hint">
          Super admins see every survey. Users see the clients they're granted below. Client Viewers
          see one client only, read-only — no editing or deleting. Reset Password generates a new
          one-time password when someone's locked out; Deactivate blocks sign-in immediately without
          deleting their history.
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
