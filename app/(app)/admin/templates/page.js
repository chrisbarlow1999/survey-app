import { createClient } from '../../../../lib/supabaseServer';
import { TemplateManager } from '../../../../components/TemplateManager';

export const dynamic = 'force-dynamic';

export default async function AdminTemplatesPage() {
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

  const [{ data: templates }, { data: taskRows }, { data: clients }, { data: owners }] = await Promise.all([
    supabase.from('project_templates').select('*').order('name', { ascending: true }),
    supabase.from('project_template_tasks').select('*').order('position', { ascending: true }),
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('profiles').select('id, full_name, email').in('role', ['user', 'super_admin']).eq('active', true).order('full_name', { ascending: true }),
  ]);

  // Stitched here rather than with an embedded select so the task order stays
  // under our control and each template gets a plain array to render.
  const withTasks = (templates || []).map((t) => ({
    ...t,
    tasks: (taskRows || []).filter((r) => r.template_id === t.id),
  }));

  return (
    <main>
      <div className="panel" style={{ padding: '12px 16px' }}>
        <h2>Project Templates</h2>
        <p className="hint">
          A standard checklist that gets copied onto a project so nobody types out &quot;order hardware,
          arrange survey, book install&quot; every time. Mark one as auto-applied and every request that
          comes in through that client&apos;s link starts with those tasks already on it. A template
          scoped to a client beats the all-clients one.
        </p>
        <TemplateManager templates={withTasks} clients={clients || []} owners={owners || []} />
      </div>
    </main>
  );
}
