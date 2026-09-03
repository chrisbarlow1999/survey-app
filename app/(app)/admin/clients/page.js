import { createClient } from '../../../../lib/supabaseServer';
import { ClientManagementPanel } from '../../../../components/ClientManagementPanel';

export const dynamic = 'force-dynamic';

export default async function AdminClientsPage() {
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

  const { data: clients } = await supabase.from('clients').select('id, name, notification_email, slug, intake_enabled').order('name', { ascending: true });

  return (
    <main>
      <div className="panel" style={{ padding: '12px 16px' }}>
        <h2>Clients</h2>
        <p className="hint">
          Clients show up on the survey form&apos;s Client dropdown, and can be granted to accounts under
          Admin → Accounts. Set a notification inbox to email that team whenever a survey comes in
          for them. Switching on a request form gives that client a public link they can use to raise
          projects themselves.
        </p>
        <ClientManagementPanel initialClients={clients || []} />
      </div>
    </main>
  );
}
