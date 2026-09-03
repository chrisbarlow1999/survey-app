import { createClient } from '../../../../../lib/supabaseServer';
import { ProjectForm } from '../../../../../components/ProjectForm';

export const dynamic = 'force-dynamic';

export default async function EditProjectPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project, error } = await supabase.from('projects').select('*').eq('id', id).single();
  if (error || !project) {
    return (
      <main>
        <div className="empty-state">Project not found, or you don't have access to edit it.</div>
      </main>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('full_name, email, role').eq('id', user.id).single();

  if (profile?.role === 'client_viewer') {
    return (
      <main>
        <div className="empty-state">You don't have permission to edit this.</div>
      </main>
    );
  }

  const [{ data: clients }, { data: owners }] = await Promise.all([
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('profiles').select('id, full_name, email').in('role', ['user', 'super_admin']).eq('active', true).order('full_name', { ascending: true }),
  ]);

  return (
    <main>
      <a className="back-link" href={`/projects/${project.id}`}>&larr; Back to Project</a>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: '14px 0' }}>Edit Project</h2>
      <ProjectForm
        project={project}
        clients={clients || []}
        owners={owners || []}
        actorName={profile?.full_name || profile?.email || 'Unknown user'}
        userId={user.id}
      />
    </main>
  );
}
