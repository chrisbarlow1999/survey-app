import { createClient } from '../../../../lib/supabaseServer';
import { ArchiveButton } from '../../../../components/ArchiveButton';
import { DeleteProjectButton } from '../../../../components/DeleteProjectButton';
import { ProjectTaskList } from '../../../../components/ProjectTaskList';
import { formatBytes } from '../../../../lib/formatBytes';
import { formatDate, formatDateTime } from '../../../../lib/formatDate';
import { statusLabel, statusTone, priorityLabel } from '../../../../lib/projectStatus';

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
    <main>
      <a className="back-link" href="/projects">&larr; Back to Projects</a>
      <div className="toolbar">
        {canEdit && <a className="btn btn-ghost" href={`/projects/${project.id}/edit`}>Edit</a>}
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

      <div className="panel">
        <h2 style={{ fontSize: 20 }}>
          {project.title}
          {project.clients?.name ? <span className="client-badge" style={{ marginLeft: 10, verticalAlign: 'middle' }}>{project.clients.name}</span> : null}
          {project.source === 'intake' ? <span className="client-badge intake-badge" style={{ marginLeft: 6, verticalAlign: 'middle' }}>Request</span> : null}
        </h2>
        <div className="kv-grid" style={{ marginTop: 12 }}>
          <div className="kv">
            <div className="k">Status</div>
            <div className="v"><span className={`status-pill status-${statusTone(project.status)}`}>{statusLabel(project.status)}</span></div>
          </div>
          <div className="kv"><div className="k">Owner</div><div className="v">{project.owner?.full_name || project.owner?.email || 'Unassigned'}</div></div>
          <div className="kv"><div className="k">Priority</div><div className="v">{priorityLabel(project.priority)}</div></div>
          <div className="kv"><div className="k">Due Date</div><div className="v">{project.due_date ? formatDate(project.due_date) : '—'}</div></div>
          <div className="kv"><div className="k">Reference</div><div className="v">{project.reference || '—'}</div></div>
          <div className="kv"><div className="k">Site</div><div className="v">{project.site_location || '—'}</div></div>
          <div className="kv"><div className="k">Address</div><div className="v">{project.address || '—'}</div></div>
          <div className="kv"><div className="k">Requested By</div><div className="v">{project.requested_by || '—'}{project.requester_email ? ` (${project.requester_email})` : ''}</div></div>
          <div className="kv"><div className="k">Raised</div><div className="v">{formatDateTime(project.created_at)}</div></div>
        </div>
        {project.description && (
          <div className="kv" style={{ borderColor: 'var(--accent-cyan)' }}>
            <div className="k">Description</div>
            <div className="v">{project.description}</div>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="kv" style={{ borderColor: 'var(--accent-cyan)' }}>
            <div className="k">Attachments</div>
            <div className="attachment-list" style={{ marginTop: 6 }}>
              {attachments.map((a, i) => (
                <div className="attachment-row" key={i}>
                  {a.url ? (
                    <a className="attachment-name" href={a.url} target="_blank" rel="noreferrer">{a.name}</a>
                  ) : (
                    <span className="attachment-name">{a.name}</span>
                  )}
                  <span className="attachment-size">{formatBytes(a.size)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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

      <div className="panel">
        <h2>Activity</h2>
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
    </main>
  );
}
