import { createClient } from '../../../lib/supabaseServer';
import { TemplateManager } from '../../../components/TemplateManager';

export const dynamic = 'force-dynamic';

// Project templates. Every internal account can see them all; staff can add
// their own and edit those, super admins can edit any and choose which one is
// auto-applied to client requests (migration 049 enforces the same rules).
export default async function TemplatesPage() {
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

  const [{ data: templates }, { data: taskRows }, { data: clients }, { data: owners }, { data: grants }] = await Promise.all([
    supabase.from('project_templates').select('*').order('name', { ascending: true }),
    supabase.from('project_template_tasks').select('*').order('position', { ascending: true }),
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('profiles').select('id, full_name, email').in('role', ['user', 'super_admin']).eq('active', true).order('full_name', { ascending: true }),
    isSuperAdmin ? Promise.resolve({ data: null }) : supabase.from('profile_clients').select('client_id').eq('profile_id', user.id),
  ]);

  // Staff may only scope a template to clients they've been granted (049), so
  // only those are offered in the Applies To dropdowns. The full list is still
  // used to name the client on templates they can't edit.
  const allowed = grants ? new Set(grants.map((g) => g.client_id)) : null;
  const scopeClients = allowed ? (clients || []).filter((c) => allowed.has(c.id)) : (clients || []);

  // Stitched here rather than with an embedded select so the task order stays
  // under our control and each template gets a plain array to render.
  const withTasks = (templates || []).map((t) => ({
    ...t,
    tasks: (taskRows || []).filter((r) => r.template_id === t.id),
  }));

  // Until migration 049 runs there's no created_by column, so staff couldn't
  // save anything — show them the templates read-only rather than offer
  // buttons that fail.
  const staffCanCreate = isSuperAdmin || (templates || []).length === 0 || 'created_by' in (templates || [])[0];

  return (
    <main>
      <div className="panel" style={{ padding: '12px 16px' }}>
        <h2>Project Templates</h2>
        <p className="hint">
          A standard checklist that gets copied onto a project so nobody types out &quot;order hardware,
          arrange survey, book install&quot; every time — pick one on the New Project form.
          {isSuperAdmin
            ? ' Mark one as auto-applied and every request that comes in through that client’s link starts with those tasks already on it. A template scoped to a client beats the all-clients one.'
            : ' You can add your own and edit the ones you created. Templates made by others, and the ones auto-applied to client requests, are read-only.'}
        </p>
        <TemplateManager
          templates={withTasks}
          clients={clients || []}
          scopeClients={scopeClients}
          owners={owners || []}
          userId={user.id}
          isSuperAdmin={isSuperAdmin}
          canCreate={staffCanCreate}
        />
      </div>
    </main>
  );
}
