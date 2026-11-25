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
import { loadSectors, projectClientLabel } from '../../../../lib/sectors';
import { loadEngineerCompanies, activeCompanyNames } from '../../../../lib/engineerCompanies';

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
  const sectorId = params.sector || '';
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
    if (sectorId) out = out.eq('sector_id', sectorId);
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

  // One row per install job (migration 046): a booked site, or a project with
  // no sites. A project with sites only ever appears through its sites, so a
  // rollout's three installs land on their own three days.
  const SELECT = 'job_key, project_id, site_id, title, reference, site_location, status, site_status, client_id, sector_id, owner_id, install_date, install_company, install_start_time, install_end_time, screen_count';
  const closed = `(${CLOSED_STATUSES.join(',')})`;
  // A site that's installed or cancelled is done, whatever the project says.
  const siteDone = (j) => j.site_status === 'installed' || j.site_status === 'cancelled';

  const [{ data: booked, error }, { data: clients }, { data: owners }, { data: lateRows }, { data: unbookedRows }, sectors, companies] =
    await Promise.all([
      applyFilters(supabase.from('install_jobs').select(SELECT))
        .gte('install_date', range.from)
        .lt('install_date', range.to)
        .order('install_date', { ascending: true }),
      supabase.from('clients').select('id, name').order('name', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email').in('role', ['user', 'super_admin']).eq('active', true).order('full_name', { ascending: true }),
      // Booked for a date that's been and gone, on work that isn't finished.
      // Deliberately not scoped to the view — it's a problem wherever you
      // happen to be looking.
      applyFilters(supabase.from('install_jobs').select(SELECT))
        .lt('install_date', today)
        .not('status', 'in', closed)
        .order('install_date', { ascending: true }),
      // Open work with no date yet: the other half of the schedule, and the
      // reason a light-looking month isn't necessarily a quiet one. Counted
      // per job, so a rollout with two of five sites booked counts three.
      applyFilters(supabase.from('install_jobs').select('job_key, site_status'))
        .is('install_date', null)
        .not('status', 'in', closed),
      loadSectors(supabase),
      loadEngineerCompanies(supabase),
    ]);

  // Client and sector names by id: the view carries the ids only, since
  // embedding through a union view isn't something PostgREST can work out.
  const clientName = Object.fromEntries((clients || []).map((c) => [c.id, c.name]));
  const sectorName = Object.fromEntries(sectors.map((s) => [s.id, s.name]));
  const withClient = (j) => ({
    ...j,
    clients: { id: j.client_id, name: clientName[j.client_id] },
    sector: j.sector_id ? { id: j.sector_id, name: sectorName[j.sector_id] } : null,
  });

  const rows = (booked || []).map(withClient);
  const late = (lateRows || []).filter((j) => !siteDone(j)).map(withClient);
  const unbooked = (unbookedRows || []).filter((j) => !siteDone(j)).length;

  // Resourcing comes from the surveys — a project carries a forecast screen
  // count, never a crew estimate. A site job counts the surveys assigned to
  // that site; a project job counts all of the project's surveys.
  const ids = [...new Set(rows.map((r) => r.project_id))];
  const crewSurveys = [];
  if (ids.length) {
    const { data: surveys } = await supabase
      .from('surveys')
      .select('id, project_id, project_site_id, engineer_days, engineer_count')
      .in('project_id', ids)
      .is('archived_at', null);
    const seen = new Set();
    for (const job of rows) {
      for (const s of surveys || []) {
        const belongs = job.site_id ? s.project_site_id === job.site_id : s.project_id === job.project_id;
        if (belongs && !seen.has(s.id)) {
          seen.add(s.id);
          crewSurveys.push(s);
        }
      }
    }
  }

  const viewScreens = screenTotals(rows);
  const viewCrew = engineerDays(crewSurveys);
  const unassigned = rows.filter((r) => !(r.install_company || '').trim()).length;

  function toggleHref(nextView) {
    const sp = new URLSearchParams();
    ['q', 'client', 'sector', 'status', 'owner', 'archived'].forEach((k) => {
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
          <div className="stat-note">Counted per site on rollouts</div>
        </div>
      </div>

      <ProjectFilters params={params} clients={clients} sectors={sectors} owners={owners} basePath="/projects/schedule" showSort={false} />

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
            <a className="sub-row" key={p.job_key} href={projectHref(p.project_id, '/projects/schedule', params)}>
              <div>
                <div className="site">
                  {p.title}
                  {p.clients?.name ? <span className="client-badge">{projectClientLabel(p)}</span> : null}
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
          firms={activeCompanyNames(companies)}
        />
      )}
    </main>
  );
}
