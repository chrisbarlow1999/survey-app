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

  const [{ data: clients }, { data: owners }, { data: templates }, { data: templateTasks }] = await Promise.all([
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('profiles').select('id, full_name, email').in('role', ['user', 'super_admin']).eq('active', true).order('full_name', { ascending: true }),
    supabase.from('project_templates').select('*').order('name', { ascending: true }),
    supabase.from('project_template_tasks').select('*').order('position', { ascending: true }),
  ]);

  const withTasks = (templates || []).map((t) => ({
    ...t,
    tasks: (templateTasks || []).filter((r) => r.template_id === t.id),
  }));

  return (
    <main className="project-main">
      <a className="back-link" href="/projects">&larr; Back to Projects</a>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: '14px 0' }}>New Project</h2>
      <div style={{ maxWidth: 920 }}>
        <ProjectForm
          clients={clients || []}
          owners={owners || []}
          templates={withTasks}
          actorName={profile?.full_name || profile?.email || 'Unknown user'}
          userId={user.id}
        />
      </div>
    </main>
  );
}
