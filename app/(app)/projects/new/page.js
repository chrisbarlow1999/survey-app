import { createClient } from '../../../../lib/supabaseServer';
import { ProjectForm } from '../../../../components/ProjectForm';

export const dynamic = 'force-dynamic';

export default async function NewProjectPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('full_name, email, role').eq('id', user.id).single();

  if (profile?.role === 'client_viewer') {
    return (
      <main>
        <div className="empty-state">You don't have permission to create projects.</div>
      </main>
    );
  }

  // RLS would reject an insert against a client this account can't access, so
  // only offer the ones they can actually use.
  const [{ data: clients }, { data: owners }] = await Promise.all([
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('profiles').select('id, full_name, email').in('role', ['user', 'super_admin']).eq('active', true).order('full_name', { ascending: true }),
  ]);

  return (
    <main>
      <a className="back-link" href="/projects">&larr; Back to Projects</a>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: '14px 0' }}>New Project</h2>
      <ProjectForm
        clients={clients || []}
        owners={owners || []}
        actorName={profile?.full_name || profile?.email || 'Unknown user'}
        userId={user.id}
      />
    </main>
  );
}
