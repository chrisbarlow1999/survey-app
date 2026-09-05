import { createClient } from '../../../../lib/supabaseServer';
import { ArchiveButton } from '../../../../components/ArchiveButton';
import { DeleteProjectButton } from '../../../../components/DeleteProjectButton';
import { ProjectTaskList } from '../../../../components/ProjectTaskList';
import { formatDate, formatDateTime } from '../../../../lib/formatDate';
import { ProjectDetailsPanel } from '../../../../components/ProjectDetailsPanel';
import { ProjectNotes } from '../../../../components/ProjectNotes';
import { ProjectAttachments } from '../../../../components/ProjectAttachments';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from('projects')
    .select('*, clients(id, name), owner:profiles!owner_id(id, full_name, email)')
    .eq('id', id)
    .single();

  if (error || !project) {
    return (
      <main>
        <div className="empty-state">Project not found, or you don't have access to view it.</div>
      </main>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase.from('profiles').select('full_name, email, role').eq('id', user.id).single();
  const canEdit = myProfile?.role !== 'client_viewer';
  const actorName = myProfile?.full_name || myProfile?.email || 'Unknown user';

  const [
    { data: tasks },
    { data: activity },
    { data: surveys },
    { data: installations },
    { data: visits },
    { data: notes },
    { data: clients },
    { data: owners },
  ] = await Promise.all([
    supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', id)
      .order('position', { ascending: true }),
    supabase
      .from('project_activity')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('surveys').select('id, site_location, survey_date').eq('project_id', id).is('archived_at', null),
    supabase.from('installations').select('id, site_location, install_date').eq('project_id', id).is('archived_at', null),
    supabase.from('visits').select('id, site_location, visit_date').eq('project_id', id).is('archived_at', null),
    supabase.from('project_notes').select('*').eq('project_id', id).order('created_at', { ascending: true }),
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('profiles').select('id, full_name, email').in('role', ['user', 'super_admin']).eq('active', true).order('full_name', { ascending: true }),
  ]);

  const attachments = await Promise.all(
    (project.attachments || []).map(async (a) => {
      const { data } = await supabase.storage.from('survey-photos').createSignedUrl(a.path, 60 * 60);
      return { ...a, url: data?.signedUrl || null };
    })
  );

  const linked = [
    ...(surveys || []).map((r) => ({ ...r, kind: 'Survey', href: `/dashboard/${r.id}`, date: r.survey_date })),
    ...(installations || []).map((r) => ({ ...r, kind: 'Install', href: `/installations/${r.id}`, date: r.install_date })),
    ...(visits || []).map((r) => ({ ...r, kind: 'Visit', href: `/visits/${r.id}`, date: r.visit_date })),
  ];

  return (
    <main className="project-main">
      <a className="back-link" href="/projects">&larr; Back to Projects</a>
      <div className="toolbar">
        {canEdit && <ArchiveButton table="projects" recordId={project.id} archived={Boolean(project.archived_at)} />}
        {canEdit && (
          <DeleteProjectButton
            projectId={project.id}
            attachmentPaths={(project.attachments || []).map((a) => a.path).filter(Boolean)}
          />
        )}
      </div>

      {project.archived_at && (
        <div className="archived-banner">
          This project is archived — it's hidden from the main list. Use Restore to bring it back.
        </div>
      )}

      {/* Two columns: the project itself on the left, the running conversation
          pinned alongside it on the right. Projects are desk work, never done
          on a phone, so the width is worth using. */}
      <div className="project-layout">
        <div className="project-col-main">
      <ProjectDetailsPanel
        project={project}
        clients={clients || []}
        owners={owners || []}
        actorName={actorName}
        canEdit={canEdit}
      />

      <ProjectAttachments
        projectId={project.id}
        attachments={attachments}
        existing={project.attachments || []}
        actorName={actorName}
        readOnly={!canEdit}
      />

      <ProjectTaskList
        projectId={project.id}
        tasks={tasks || []}
        actorName={actorName}
        readOnly={!canEdit}
      />

      <div className="panel">
        <h2>Site Records</h2>
        <p className="hint">
          Surveys, installs and visits linked to this project. Link them from the record's own page —
          engineers submitting the public forms have no way to know which project a job belongs to.
        </p>
        {linked.length === 0 && <div className="empty-state">Nothing linked to this project yet.</div>}
        {linked.map((r) => (
          <a className="sub-row" key={`${r.kind}-${r.id}`} href={r.href}>
            <div>
              <div className="site">{r.site_location || 'Untitled site'}</div>
              <div className="meta">{r.date ? formatDate(r.date) : '—'}</div>
            </div>
            <div className="count">{r.kind}</div>
          </a>
        ))}
      </div>

      {/* Collapsed by default — the trail matters when you're checking what
          happened, not every time you open a project. A native <details> keeps
          this page a server component: no client JS, and it's keyboard
          accessible for free. */}
      <details className="panel collapsible-panel">
        <summary>
          <h2>Activity</h2>
          {activity && activity.length > 0 && <span className="panel-count">{activity.length}</span>}
        </summary>
        <div className="collapsible-body">
          {(!activity || activity.length === 0) && <div className="empty-state">No activity recorded yet.</div>}
          {activity && activity.length > 0 && (
            <div className="activity-list">
              {activity.map((a) => (
                <div className="activity-row" key={a.id}>
                  <div className="activity-main">
                    <span className="activity-action">{a.action}</span>
                    {a.detail ? <span className="activity-detail"> — {a.detail}</span> : null}
                  </div>
                  <div className="activity-meta">{a.actor_name} · {formatDateTime(a.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
        </div>

        <aside className="project-col-side">
          <ProjectNotes
            projectId={project.id}
            notes={notes || []}
            currentUserId={user.id}
            isSuperAdmin={myProfile?.role === 'super_admin'}
            actorName={actorName}
            readOnly={!canEdit}
          />
        </aside>
      </div>
    </main>
  );
}
