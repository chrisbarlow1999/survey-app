import { createClient } from '../../../../lib/supabaseServer';
import { ArchiveButton } from '../../../../components/ArchiveButton';
import { DeleteProjectButton } from '../../../../components/DeleteProjectButton';
import { DuplicateProjectButton } from '../../../../components/DuplicateProjectButton';
import { ProjectTaskList } from '../../../../components/ProjectTaskList';
import { formatDate, formatDateTime } from '../../../../lib/formatDate';
import { ProjectDetailsPanel } from '../../../../components/ProjectDetailsPanel';
import { ProjectNotes } from '../../../../components/ProjectNotes';
import { ProjectAttachments } from '../../../../components/ProjectAttachments';
import { parseReturnHref, backLabel } from '../../../../lib/projectBackLink';
import { surveyInclusion, screenCountOf } from '../../../../lib/surveyScreens';
import { SurveyCountPanel } from '../../../../components/SurveyCountPanel';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params, searchParams }) {
  const { id } = await params;
  // Where to go back to. Rebuilt from an allowlist rather than followed as
  // given — see lib/projectBackLink.js.
  const backHref = parseReturnHref((await searchParams)?.back);
  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from('projects')
    .select('*, clients(id, name), owner:profiles!owner_id(id, full_name, email)')
    .eq('id', id)
    .single();

  if (error || !project) {
    return (
      <main>
        <a className="back-link" href={backHref}>&larr; {backLabel(backHref)}</a>
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
    { data: surveys, error: surveysError },
    { data: installations, error: installsError },
    { data: visits, error: visitsError },
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
    // locations comes along so the project can show what was actually
    // surveyed next to the PM's forecast — the two drifting apart is the
    // thing worth noticing.
    supabase.from('surveys').select('id, project_id, site_location, survey_date, submitted_at, counts_in_totals, locations').eq('project_id', id).is('archived_at', null),
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

  // The same decision /projects/screens makes, from the same function. If the
  // two disagreed, a project would report one figure on its own page and a
  // different one in the pipeline view.
  const inclusion = surveyInclusion(surveys || []);
  const surveyedScreens = inclusion.kept.reduce((n, s) => n + screenCountOf(s), 0);

  // A sub-query that fails here returns { data: null } without throwing, so
  // Site Records would render "Nothing linked to this project yet" — the same
  // thing it shows when the link genuinely hasn't been made. That sends you
  // looking at the wrong problem. Say it failed instead.
  const linkedError = surveysError || installsError || visitsError;

  const linked = [
    ...(surveys || []).map((r) => ({ ...r, kind: 'Survey', href: `/dashboard/${r.id}`, date: r.survey_date })),
    ...(installations || []).map((r) => ({ ...r, kind: 'Install', href: `/installations/${r.id}`, date: r.install_date })),
    ...(visits || []).map((r) => ({ ...r, kind: 'Visit', href: `/visits/${r.id}`, date: r.visit_date })),
  ];

  return (
    <main className="project-main">
      <a className="back-link" href={backHref}>&larr; {backLabel(backHref)}</a>
      <div className="toolbar">
        {canEdit && (
          <DuplicateProjectButton project={project} tasks={tasks || []} actorName={actorName} />
        )}
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
        surveyedScreens={surveyedScreens}
      />

      {(surveys || []).length > 0 && (
        <SurveyCountPanel
          projectId={project.id}
          entries={inclusion.entries}
          actorName={actorName}
          readOnly={!canEdit}
        />
      )}

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
        {linkedError && (
          <p className="error-text">
            Could not load linked records: {linkedError.message}. This section is empty because the
            query failed, not because nothing is linked.
          </p>
        )}
        {!linkedError && linked.length === 0 && (
          <div className="empty-state">Nothing linked to this project yet.</div>
        )}
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
