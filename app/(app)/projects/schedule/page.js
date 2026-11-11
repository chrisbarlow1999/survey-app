import { createClient } from '../../../../lib/supabaseServer';
import { formatDate } from '../../../../lib/formatDate';
import { applyArchiveFilter } from '../../../../components/ArchiveFilter';
import { statusLabel, statusTone, CLOSED_STATUSES } from '../../../../lib/projectStatus';
import { ProjectViewTabs } from '../../../../components/ProjectViewTabs';
import { ProjectFilters } from '../../../../components/ProjectFilters';
import { InstallCalendar } from '../../../../components/InstallCalendar';
import { projectHref } from '../../../../lib/projectBackLink';
import { screenTotals } from '../../../../lib/screenCount';
import { engineerDays } from '../../../../lib/surveyScreens';
import { buildMonthGrid, startOfWeek, addDays, startOfMonth, todayIso } from '../../../../lib/installCalendar';

export const dynamic = 'force-dynamic';

// The install calendar. Month to scan for busy days, week to see who is out
// and when — a row per engineering firm, so a day with SCCI in Nottingham and
// a spare Compass site nearby is visible rather than deduced.
//
// Both views read the same data; only the date range differs, so the figures
// above always describe exactly what is on screen.
export default async function ProjectSchedulePage({ searchParams }) {
  const params = (await searchParams) || {};
  const q = (params.q || '').trim();
  const clientId = params.client || '';
  const status = params.status || '';
  const owner = params.owner || '';
  const archived = params.archived || '';
  const view = params.view === 'week' ? 'week' : 'month';

  const today = todayIso();
  // An unparseable ?start= falls back to today rather than throwing a date
  // error at someone who edited the URL.
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.start || '') ? params.start : today;

  // The range has to cover the whole grid, including the neighbouring-month
  // days a month view shows, or those cells would wrongly read as empty.
  const range = view === 'month'
    ? (() => { const g = buildMonthGrid(anchor); return { from: g.gridStart, to: g.gridEnd }; })()
    : (() => { const s = startOfWeek(anchor); return { from: s, to: addDays(s, 7) }; })();

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

  const SELECT = 'id, title, site_location, status, install_date, install_company, install_start_time, install_end_time, due_date, screen_count, client_id, clients(id, name), owner:profiles!owner_id(id, full_name, email)';
  const closed = `(${CLOSED_STATUSES.join(',')})`;

  const [{ data: booked, error }, { data: clients }, { data: owners }, { data: late }, { count: unbooked }] =
    await Promise.all([
      applyFilters(supabase.from('projects').select(SELECT))
        .gte('install_date', range.from)
        .lt('install_date', range.to)
        .order('install_date', { ascending: true }),
      supabase.from('clients').select('id, name').order('name', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email').in('role', ['user', 'super_admin']).eq('active', true).order('full_name', { ascending: true }),
      // Booked for a date that's been and gone, on work that isn't finished.
      // Deliberately not scoped to the view — it's a problem wherever you
      // happen to be looking.
      applyFilters(supabase.from('projects').select(SELECT))
        .lt('install_date', today)
        .not('status', 'in', closed)
        .order('install_date', { ascending: true }),
      // Open work with no date yet: the other half of the schedule, and the
      // reason a light-looking month isn't necessarily a quiet one.
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

  const viewScreens = screenTotals(rows);
  const viewCrew = engineerDays(Object.values(surveysByProject).flat());
  const unassigned = rows.filter((r) => !(r.install_company || '').trim()).length;

  function toggleHref(nextView) {
    const sp = new URLSearchParams();
    ['q', 'client', 'status', 'owner', 'archived'].forEach((k) => {
      if (params[k]) sp.set(k, params[k]);
    });
    sp.set('view', nextView);
    // Keep the reader roughly where they were when switching views.
    sp.set('start', nextView === 'month' ? startOfMonth(anchor) : startOfWeek(anchor));
    return `/projects/schedule?${sp.toString()}`;
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
          <div className="stat-value">{viewScreens.total}</div>
          <div className="stat-label">Screens In View</div>
          {viewScreens.unestimated > 0 && (
            <div className="stat-note">{viewScreens.unestimated} not estimated</div>
          )}
        </div>
        <div className="stat-tile">
          <div className="stat-value">{viewCrew.total}</div>
          <div className="stat-label">Engineer-Days In View</div>
          {/* Days × engineers, from the linked surveys. A survey missing either
              number is left out rather than assumed to be one person. */}
          {viewCrew.incomplete > 0 && (
            <div className="stat-note">
              {viewCrew.incomplete} survey{viewCrew.incomplete === 1 ? '' : 's'} without an estimate
            </div>
          )}
        </div>
        <div className={`stat-tile${unassigned > 0 ? ' stat-tile-alert' : ''}`}>
          <div className="stat-value">{unassigned}</div>
          <div className="stat-label">No Firm Booked</div>
          <div className="stat-note">Dated, but nobody assigned</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{unbooked || 0}</div>
          <div className="stat-label">Open, Not Yet Booked</div>
        </div>
      </div>

      <ProjectFilters params={params} clients={clients} owners={owners} basePath="/projects/schedule" showSort={false} />

      <div className="view-tabs" style={{ marginBottom: 14 }}>
        <a className={view === 'month' ? 'on' : ''} href={toggleHref('month')}>Month</a>
        <a className={view === 'week' ? 'on' : ''} href={toggleHref('week')}>Week</a>
      </div>

      {(late || []).length > 0 && (
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
                  {p.site_location || 'No site set'} · {p.install_company || 'No firm booked'}
                </div>
              </div>
              <div className="count home-overdue">{formatDate(p.install_date)}</div>
            </a>
          ))}
        </div>
      )}

      {error && (
        <div className="panel"><p className="error-text">Could not load the calendar: {error.message}</p></div>
      )}

      {!error && (
        <InstallCalendar
          projects={rows}
          view={view}
          anchor={anchor}
          basePath="/projects/schedule"
          params={params}
          today={today}
        />
      )}
    </main>
  );
}
