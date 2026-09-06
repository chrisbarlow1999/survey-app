import { createClient } from '../../../../lib/supabaseServer';
import { formatDate } from '../../../../lib/formatDate';
import { applyArchiveFilter } from '../../../../components/ArchiveFilter';
import { statusLabel, statusTone, CLOSED_STATUSES } from '../../../../lib/projectStatus';
import { ProjectViewTabs } from '../../../../components/ProjectViewTabs';
import { ProjectFilters } from '../../../../components/ProjectFilters';
import { projectHref } from '../../../../lib/projectBackLink';
import { screenTotals } from '../../../../lib/screenCount';
import { engineerDays } from '../../../../lib/surveyScreens';
import { buildWeeks, startOfWeek, addWeeks, todayIso } from '../../../../lib/scheduleWeeks';

export const dynamic = 'force-dynamic';

// A quarter at a time — far enough ahead to plan resourcing, short enough that
// the whole thing fits on a screen without scrolling past empty weeks.
const WEEKS = 12;

export default async function ProjectSchedulePage({ searchParams }) {
  const params = (await searchParams) || {};
  const q = (params.q || '').trim();
  const clientId = params.client || '';
  const status = params.status || '';
  const owner = params.owner || '';
  const archived = params.archived || '';
  const offset = Number.parseInt(params.offset, 10) || 0;

  const today = todayIso();
  const windowStart = addWeeks(startOfWeek(today), offset * WEEKS);
  const windowEnd = addWeeks(windowStart, WEEKS); // exclusive
  const weeks = buildWeeks(windowStart, WEEKS);

  const supabase = await createClient();

  function applyFilters(query) {
    let out = applyArchiveFilter(query, archived);
    if (clientId) out = out.eq('client_id', clientId);
    if (status) out = out.eq('status', status);
    if (owner === 'none') out = out.is('owner_id', null);
    else if (owner) out = out.eq('owner_id', owner);
    if (q) {
      const safeQ = q.replace(/[",()]/g, '');
      out = out.or(
        `title.ilike."%${safeQ}%",reference.ilike."%${safeQ}%",site_location.ilike."%${safeQ}%"`
      );
    }
    return out;
  }

  const SELECT = 'id, title, site_location, status, install_date, due_date, screen_count, client_id, clients(id, name), owner:profiles!owner_id(id, full_name, email)';
  const closed = `(${CLOSED_STATUSES.join(',')})`;

  const [{ data: booked, error }, { data: clients }, { data: owners }, { data: late }, { count: unbooked }] =
    await Promise.all([
      applyFilters(supabase.from('projects').select(SELECT))
        .gte('install_date', windowStart)
        .lt('install_date', windowEnd)
        .order('install_date', { ascending: true }),
      supabase.from('clients').select('id, name').order('name', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email').in('role', ['user', 'super_admin']).eq('active', true).order('full_name', { ascending: true }),
      // Booked for a date that's been and gone, on work that isn't finished.
      // Deliberately not scoped to the window — it's a problem wherever you
      // happen to be looking.
      applyFilters(supabase.from('projects').select(SELECT))
        .lt('install_date', today)
        .not('status', 'in', closed)
        .order('install_date', { ascending: true }),
      // Open work with no date yet: the other half of the schedule, and the
      // reason a light-looking quarter isn't necessarily a quiet one.
      applyFilters(supabase.from('projects').select('id', { count: 'exact', head: true }))
        .is('install_date', null)
        .not('status', 'in', closed),
    ]);

  const rows = booked || [];

  // Resourcing comes from the surveys attached to these projects — a project
  // carries a forecast screen count, never a crew estimate.
  const ids = rows.map((r) => r.id);
  const surveysByProject = {};
  if (ids.length) {
    const { data: surveys } = await supabase
      .from('surveys')
      .select('id, project_id, engineer_days, engineer_count')
      .in('project_id', ids)
      .is('archived_at', null);
    (surveys || []).forEach((s) => {
      (surveysByProject[s.project_id] = surveysByProject[s.project_id] || []).push(s);
    });
  }

  const windowScreens = screenTotals(rows);
  const windowCrew = engineerDays(Object.values(surveysByProject).flat());

  function navHref(nextOffset) {
    const sp = new URLSearchParams();
    ['q', 'client', 'status', 'owner', 'archived'].forEach((k) => {
      if (params[k]) sp.set(k, params[k]);
    });
    if (nextOffset !== 0) sp.set('offset', String(nextOffset));
    const qs = sp.toString();
    return qs ? `/projects/schedule?${qs}` : '/projects/schedule';
  }

  return (
    <main className="project-main">
      <ProjectViewTabs current="schedule" params={params} />

      <div className="stats-strip">
        <div className="stat-tile">
          <div className="stat-value">{rows.length}</div>
          <div className="stat-label">Installs In View</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{windowScreens.total}</div>
          <div className="stat-label">Screens In View</div>
          {windowScreens.unestimated > 0 && (
            <div className="stat-note">{windowScreens.unestimated} not estimated</div>
          )}
        </div>
        <div className="stat-tile">
          <div className="stat-value">{windowCrew.total}</div>
          <div className="stat-label">Engineer-Days In View</div>
          {/* Days × engineers, from the linked surveys. A survey missing either
              number is left out rather than assumed to be one person. */}
          {windowCrew.incomplete > 0 && (
            <div className="stat-note">
              {windowCrew.incomplete} survey{windowCrew.incomplete === 1 ? '' : 's'} without an estimate
            </div>
          )}
        </div>
        <div className="stat-tile">
          <div className="stat-value">{unbooked || 0}</div>
          <div className="stat-label">Open, Not Yet Booked</div>
        </div>
      </div>

      <ProjectFilters params={params} clients={clients} owners={owners} basePath="/projects/schedule" showSort={false} />

      {offset === 0 && (late || []).length > 0 && (
        <div className="panel">
          <h2>Install date has passed <span className="panel-count">{late.length}</span></h2>
          <p className="hint">
            Booked for a date that&apos;s been and gone, on work not marked complete. Either the job
            moved and the date didn&apos;t, or it&apos;s finished and nobody said so.
          </p>
          {late.map((p) => (
            <a className="sub-row" key={p.id} href={projectHref(p.id, '/projects/schedule', params)}>
              <div>
                <div className="site">
                  {p.title}
                  {p.clients?.name ? <span className="client-badge">{p.clients.name}</span> : null}
                </div>
                <div className="meta">
                  {p.site_location || 'No site set'} · {p.owner?.full_name || p.owner?.email || 'Unassigned'}
                </div>
              </div>
              <div className="count home-overdue">{formatDate(p.install_date)}</div>
            </a>
          ))}
        </div>
      )}

      <div className="panel" style={{ padding: '12px 16px' }}>
        <div className="schedule-nav">
          <a className="btn btn-ghost" href={navHref(offset - 1)}>&larr; Earlier</a>
          <div className="schedule-range">
            {formatDate(windowStart)} &ndash; {formatDate(weeks[weeks.length - 1].end)}
            {offset !== 0 && <a className="schedule-today" href={navHref(0)}>Back to today</a>}
          </div>
          <a className="btn btn-ghost" href={navHref(offset + 1)}>Later &rarr;</a>
        </div>

        {error && <p className="error-text">Could not load the schedule: {error.message}</p>}

        {weeks.map((w) => {
          const inWeek = rows.filter((p) => p.install_date >= w.start && p.install_date <= w.end);
          const wScreens = screenTotals(inWeek);
          const wCrew = engineerDays(inWeek.flatMap((p) => surveysByProject[p.id] || []));
          const isThisWeek = today >= w.start && today <= w.end;
          return (
            <div className={`schedule-week${isThisWeek ? ' current' : ''}`} key={w.key}>
              <div className="schedule-week-head">
                <span className="schedule-week-label">
                  Week of {formatDate(w.start)}
                  {isThisWeek && <span className="schedule-now">This week</span>}
                </span>
                {inWeek.length > 0 && (
                  <span className="schedule-week-totals">
                    {inWeek.length} install{inWeek.length === 1 ? '' : 's'} · {wScreens.total} screen{wScreens.total === 1 ? '' : 's'}
                    {wCrew.total > 0 ? ` · ${wCrew.total} engineer-days` : ''}
                  </span>
                )}
              </div>
              {inWeek.length === 0 && <div className="schedule-empty">Nothing booked</div>}
              {inWeek.map((p) => (
                <a className="sub-row" key={p.id} href={projectHref(p.id, '/projects/schedule', params)}>
                  <div>
                    <div className="site">
                      {p.title}
                      {p.clients?.name ? <span className="client-badge">{p.clients.name}</span> : null}
                    </div>
                    <div className="meta">
                      {formatDate(p.install_date)} · {p.site_location || 'No site set'} · {p.owner?.full_name || p.owner?.email || 'Unassigned'}
                    </div>
                  </div>
                  <div className="count">
                    <span className={`status-pill status-${statusTone(p.status)}`}>{statusLabel(p.status)}</span>
                    <span className="schedule-screens">
                      {p.screen_count == null ? 'No estimate' : `${p.screen_count} screen${p.screen_count === 1 ? '' : 's'}`}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          );
        })}
      </div>
    </main>
  );
}
