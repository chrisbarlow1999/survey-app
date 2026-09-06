import { createClient } from '../../../lib/supabaseServer';
import { formatDate, formatDateTime } from '../../../lib/formatDate';
import { PROJECT_STATUSES, statusLabel, statusTone, CLOSED_STATUSES } from '../../../lib/projectStatus';
import { screenTotals, screensByStatus } from '../../../lib/screenCount';
import { valueTotals, valueByStatus, formatGBP, formatGBPShort } from '../../../lib/money';

export const dynamic = 'force-dynamic';

// Days without a logged activity before a project counts as having gone quiet.
const QUIET_DAYS = 14;
// No panel here is a full list — each one is a prompt to go and look.
const PANEL_LIMIT = 8;

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles').select('full_name, email, role').eq('id', user.id).single();

  const firstName = (profile?.full_name || '').split(' ')[0] || null;
  // Client viewers have no projects at all, so their home is just the records
  // they're allowed to see.
  const isClientViewer = profile?.role === 'client_viewer';
  const none = Promise.resolve({ data: [] });

  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const closed = `(${CLOSED_STATUSES.join(',')})`;

  const [
    { data: openProjects },
    { data: myTasks },
    { data: unassigned },
    { data: quiet },
    { data: recentSurveys },
    { data: recentInstalls },
    { data: recentVisits },
    { count: surveysThisMonth },
    { count: installsThisMonth },
    { count: visitsThisMonth },
  ] = await Promise.all([
    isClientViewer ? none : supabase
      .from('projects').select('id, status, due_date, owner_id, screen_count, value_gbp')
      .is('archived_at', null).not('status', 'in', closed),
    isClientViewer ? none : supabase
      .from('project_tasks')
      .select('id, title, due_date, project_id, projects!inner(id, title, owner_id, archived_at)')
      .is('completed_at', null)
      .not('due_date', 'is', null)
      .lte('due_date', weekEnd)
      .eq('projects.owner_id', user.id)
      .is('projects.archived_at', null)
      .order('due_date', { ascending: true })
      .limit(PANEL_LIMIT),
    isClientViewer ? none : supabase
      .from('projects').select('id, title, created_at, clients(name)')
      .eq('source', 'intake').is('owner_id', null).is('archived_at', null)
      .order('created_at', { ascending: false }).limit(PANEL_LIMIT),
    isClientViewer ? none : supabase
      .from('projects').select('id, title, status, last_activity_at, clients(name)')
      .is('archived_at', null).not('status', 'in', closed)
      .lt('last_activity_at', daysAgo(QUIET_DAYS))
      .order('last_activity_at', { ascending: true }).limit(PANEL_LIMIT),
    supabase.from('surveys').select('id, site_location, submitted_at, clients(name)')
      .is('archived_at', null).order('submitted_at', { ascending: false }).limit(5),
    supabase.from('installations').select('id, site_location, submitted_at, clients(name)')
      .is('archived_at', null).order('submitted_at', { ascending: false }).limit(5),
    supabase.from('visits').select('id, site_location, submitted_at, clients(name)')
      .is('archived_at', null).order('submitted_at', { ascending: false }).limit(5),
    // Counted properly rather than derived from the capped list below — that
    // would have quietly under-reported the moment more than eight records
    // came in during a month, which is exactly the kind of wrong figure that
    // stops people trusting a dashboard. head:true fetches no rows.
    supabase.from('surveys').select('id', { count: 'exact', head: true })
      .is('archived_at', null).gte('submitted_at', monthStart),
    supabase.from('installations').select('id', { count: 'exact', head: true })
      .is('archived_at', null).gte('submitted_at', monthStart),
    supabase.from('visits').select('id', { count: 'exact', head: true })
      .is('archived_at', null).gte('submitted_at', monthStart),
  ]);

  const projects = openProjects || [];
  const overdueProjects = projects.filter((p) => p.due_date && p.due_date < today).length;
  const mine = projects.filter((p) => p.owner_id === user.id).length;
  // Screens across open projects — the figure management asked for. Closed and
  // cancelled work is already excluded by the query above, so this is what's
  // still coming rather than what has ever been sold.
  const screens = screenTotals(projects);
  const stages = screensByStatus(projects, PROJECT_STATUSES);
  const value = valueTotals(projects);
  // Keyed by status so the two lists can be read together without a second
  // pass — same projects, same order, one row each.
  const valueStages = Object.fromEntries(valueByStatus(projects, PROJECT_STATUSES).map((v) => [v.key, v]));

  const tasks = myTasks || [];
  const overdueTasks = tasks.filter((t) => t.due_date < today);

  const recent = [
    ...(recentSurveys || []).map((r) => ({ ...r, kind: 'Survey', href: `/dashboard/${r.id}` })),
    ...(recentInstalls || []).map((r) => ({ ...r, kind: 'Install', href: `/installations/${r.id}` })),
    ...(recentVisits || []).map((r) => ({ ...r, kind: 'Visit', href: `/visits/${r.id}` })),
  ]
    .sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''))
    .slice(0, 8);

  const thisMonth = (surveysThisMonth || 0) + (installsThisMonth || 0) + (visitsThisMonth || 0);

  return (
    <main className="project-main">
      <h1 className="home-greeting">{firstName ? `Hello, ${firstName}` : 'Hello'}</h1>
      <p className="home-sub">Here&apos;s what needs you today.</p>

      <div className="stats-strip">
        <div className="stat-tile">
          <div className="stat-value">{projects.length}</div>
          <div className="stat-label">Open Projects</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{mine}</div>
          <div className="stat-label">Owned By You</div>
        </div>
        <div className={`stat-tile${overdueProjects ? ' stat-tile-alert' : ''}`}>
          <div className="stat-value">{overdueProjects}</div>
          <div className="stat-label">Past Due Date</div>
        </div>
        <div className={`stat-tile${overdueTasks.length ? ' stat-tile-alert' : ''}`}>
          <div className="stat-value">{overdueTasks.length}</div>
          <div className="stat-label">Your Overdue Tasks</div>
        </div>
        {!isClientViewer && (
          <div className="stat-tile">
            <div className="stat-value">{screens.total}</div>
            <div className="stat-label">Screens In Pipeline</div>
            {/* Shown rather than folded into the total: a projected figure that
                silently treats "nobody has estimated this" as zero is the kind
                of wrong number that stops a dashboard being trusted. */}
            {screens.unestimated > 0 && (
              <div className="stat-note">{screens.unestimated} project{screens.unestimated === 1 ? '' : 's'} not estimated</div>
            )}
          </div>
        )}
        {!isClientViewer && (
          <div className="stat-tile">
            <div className="stat-value">{formatGBPShort(value.total)}</div>
            <div className="stat-label">Pipeline Value</div>
            {value.unquoted > 0 && (
              <div className="stat-note">{value.unquoted} project{value.unquoted === 1 ? '' : 's'} not quoted</div>
            )}
          </div>
        )}
        <div className="stat-tile">
          <div className="stat-value">{thisMonth}</div>
          <div className="stat-label">Submitted This Month</div>
        </div>
      </div>

      <div className="home-grid">
        {!isClientViewer && (
          <div className="panel">
            <h2>Pipeline by stage</h2>
            <p className="hint">
              Open projects by where they&apos;ve got to, with the forecast screens and quoted value in
              each. Pick a stage to see what&apos;s in it.
            </p>
            {stages.length === 0 && <div className="empty-state">No open projects.</div>}
            {stages.map((s) => (
              <a className="sub-row" key={s.key} href={`/projects?status=${s.key}`}>
                <div>
                  <div className="site">
                    <span className={`status-pill status-${s.tone}`}>{s.label}</span>
                  </div>
                  <div className="meta">
                    {s.projects} project{s.projects === 1 ? '' : 's'} · {s.screens} screen{s.screens === 1 ? '' : 's'}
                    {s.unestimated > 0 ? ` · ${s.unestimated} not estimated` : ''}
                  </div>
                </div>
                <div className="count">
                  {formatGBP(valueStages[s.key]?.value || 0)}
                  {valueStages[s.key]?.unquoted > 0 && (
                    <span className="schedule-screens">{valueStages[s.key].unquoted} not quoted</span>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}

        {!isClientViewer && (
          <div className="panel">
            <h2>Your tasks {tasks.length > 0 && <span className="panel-count">{tasks.length}</span>}</h2>
            <p className="hint">Open tasks on projects you own, due within the next week.</p>
            {tasks.length === 0 && <div className="empty-state">Nothing due on your projects.</div>}
            {tasks.map((t) => {
              const overdue = t.due_date < today;
              return (
                <a className="sub-row" key={t.id} href={`/projects/${t.project_id}`}>
                  <div>
                    <div className="site">{t.title}</div>
                    <div className="meta">{t.projects?.title}</div>
                  </div>
                  <div className={`count${overdue ? ' home-overdue' : ''}`}>
                    {overdue ? 'Overdue ' : 'Due '}{formatDate(t.due_date)}
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {!isClientViewer && (
          <div className="panel">
            <h2>
              Unassigned requests
              {(unassigned || []).length > 0 && <span className="panel-count">{unassigned.length}</span>}
            </h2>
            <p className="hint">Client requests nobody has picked up yet.</p>
            {(!unassigned || unassigned.length === 0) && (
              <div className="empty-state">Every request has an owner.</div>
            )}
            {(unassigned || []).map((p) => (
              <a className="sub-row" key={p.id} href={`/projects/${p.id}`}>
                <div>
                  <div className="site">
                    {p.title}
                    {p.clients?.name ? <span className="client-badge">{p.clients.name}</span> : null}
                  </div>
                  <div className="meta">Raised {formatDateTime(p.created_at)}</div>
                </div>
                <div className="count">Unassigned</div>
              </a>
            ))}
          </div>
        )}

        {!isClientViewer && (
          <div className="panel">
            <h2>
              Gone quiet
              {(quiet || []).length > 0 && <span className="panel-count">{quiet.length}</span>}
            </h2>
            <p className="hint">Open projects with nothing logged in {QUIET_DAYS} days.</p>
            {(!quiet || quiet.length === 0) && (
              <div className="empty-state">Everything open has moved recently.</div>
            )}
            {(quiet || []).map((p) => (
              <a className="sub-row" key={p.id} href={`/projects/${p.id}`}>
                <div>
                  <div className="site">
                    {p.title}
                    {p.clients?.name ? <span className="client-badge">{p.clients.name}</span> : null}
                  </div>
                  <div className="meta">Last moved {formatDate(p.last_activity_at)}</div>
                </div>
                <div className="count">
                  <span className={`status-pill status-${statusTone(p.status)}`}>{statusLabel(p.status)}</span>
                </div>
              </a>
            ))}
          </div>
        )}

        <div className="panel">
          <h2>Latest from site</h2>
          <p className="hint">The most recent surveys, installs and visits submitted.</p>
          {recent.length === 0 && <div className="empty-state">Nothing submitted yet.</div>}
          {recent.map((r) => (
            <a className="sub-row" key={`${r.kind}-${r.id}`} href={r.href}>
              <div>
                <div className="site">
                  {r.site_location || 'Untitled site'}
                  {r.clients?.name ? <span className="client-badge">{r.clients.name}</span> : null}
                </div>
                <div className="meta">{formatDateTime(r.submitted_at)}</div>
              </div>
              <div className="count">{r.kind}</div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
