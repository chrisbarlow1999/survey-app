import { formatDate } from '../lib/formatDate';
import { projectHref } from '../lib/projectBackLink';
import {
  UNASSIGNED,
  DAY_NAMES,
  lanesFor,
  bucketByDayAndCompany,
  countsForDay,
  formatTimeRange,
  weekDays,
  buildMonthGrid,
  monthLabel,
  addDays,
  addMonths,
  startOfWeek,
  startOfMonth,
} from '../lib/installCalendar';

// The install calendar: who is booked where, and when.
//
// Two views of the same data. Month answers "which days are stacked"; week
// answers "who is out that day, and could they take another job while they're
// there". A server component — every control is a link, so the view, the week
// you're looking at and the filters all live in the URL and can be shared.

// Lane colours are assigned by position in the lane list, so a firm keeps the
// same colour across both views and across weeks.
function laneClass(name, index) {
  return name === UNASSIGNED ? 'lane-none' : `lane-${index % 5}`;
}

function navHref(basePath, params, patch) {
  const sp = new URLSearchParams();
  ['q', 'client', 'status', 'owner', 'archived'].forEach((k) => {
    if (params?.[k]) sp.set(k, params[k]);
  });
  Object.entries(patch).forEach(([k, v]) => {
    if (v) sp.set(k, v);
  });
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function JobBlock({ project, params, basePath, laneCls }) {
  const time = formatTimeRange(project.install_start_time, project.install_end_time);
  return (
    <a className={`cal-job ${laneCls}`} href={projectHref(project.id, basePath, params)}>
      <span className="cal-job-time">{time}</span>
      <span className="cal-job-title">{project.title}</span>
      {/* Site and client are the point of the whole view: this is what lets
          you see that SCCI is already in Nottingham that day. */}
      <span className="cal-job-meta">
        {[project.site_location, project.clients?.name].filter(Boolean).join(' · ') || 'No site set'}
      </span>
      {project.screen_count != null && (
        <span className="cal-job-meta">{project.screen_count} screen{project.screen_count === 1 ? '' : 's'}</span>
      )}
    </a>
  );
}

export function InstallCalendar({ projects, view, anchor, basePath, params, today }) {
  const rows = projects || [];
  const byDay = bucketByDayAndCompany(rows);
  const lanes = lanesFor(rows);

  // ---------------- month ----------------
  if (view === 'month') {
    const grid = buildMonthGrid(anchor);
    const prev = addMonths(grid.monthStart, -1);
    const next = addMonths(grid.monthStart, 1);

    return (
      <div className="panel" style={{ padding: '12px 16px' }}>
        <div className="schedule-nav">
          <a className="btn btn-ghost" href={navHref(basePath, params, { view: 'month', start: prev })}>&larr; Earlier</a>
          <div className="schedule-range">
            {monthLabel(grid.monthStart)}
            <a className="schedule-today" href={navHref(basePath, params, { view: 'month', start: startOfMonth(today) })}>
              Back to today
            </a>
          </div>
          <a className="btn btn-ghost" href={navHref(basePath, params, { view: 'month', start: next })}>Later &rarr;</a>
        </div>

        <div className="cal-month">
          {DAY_NAMES.map((d) => <div className="cal-month-dayname" key={d}>{d}</div>)}
          {grid.weeks.flat().map((cell) => {
            const { total, byCompany } = countsForDay(byDay, cell.iso);
            const isToday = cell.iso === today;
            return (
              <a
                className={`cal-month-cell${cell.inMonth ? '' : ' outside'}${isToday ? ' today' : ''}${total > 0 ? ' has-jobs' : ''}`}
                key={cell.iso}
                // Clicking a day opens the week it sits in, which is where the
                // times and site names are.
                href={navHref(basePath, params, { view: 'week', start: startOfWeek(cell.iso) })}
              >
                <span className="cal-month-date">
                  {Number(cell.iso.slice(8, 10))}
                  {total > 0 && <span className="cal-month-total">{total}</span>}
                </span>
                {byCompany.map((c) => {
                  const idx = lanes.indexOf(c.name);
                  return (
                    <span className={`cal-chip ${laneClass(c.name, idx)}`} key={c.name}>
                      {c.name === UNASSIGNED ? 'Unassigned' : c.name} {c.count}
                    </span>
                  );
                })}
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------------- week ----------------
  const weekStart = startOfWeek(anchor);
  const days = weekDays(weekStart);
  const prev = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);
  // Only draw a lane that has work this week, plus Unassigned whenever
  // anything is unassigned — an empty grid of five firms is noise.
  const activeLanes = lanes.filter((name) =>
    days.some((d) => (byDay.get(d)?.get(name) || []).length > 0)
  );

  return (
    <div className="panel" style={{ padding: '12px 16px' }}>
      <div className="schedule-nav">
        <a className="btn btn-ghost" href={navHref(basePath, params, { view: 'week', start: prev })}>&larr; Earlier</a>
        <div className="schedule-range">
          Week of {formatDate(weekStart)}
          <a className="schedule-today" href={navHref(basePath, params, { view: 'week', start: startOfWeek(today) })}>
            Back to today
          </a>
        </div>
        <a className="btn btn-ghost" href={navHref(basePath, params, { view: 'week', start: next })}>Later &rarr;</a>
      </div>

      <div className="cal-scroll">
        <div className="cal-week">
          <div className="cal-corner" />
          {days.map((d, i) => {
            const { total } = countsForDay(byDay, d);
            return (
              <div className={`cal-week-head${d === today ? ' today' : ''}`} key={d}>
                <span className="cal-week-dayname">{DAY_NAMES[i]}</span>
                <span className="cal-week-date">{formatDate(d).slice(0, 5)}</span>
                {/* The busy-day signal, across every firm. */}
                {total > 0 && <span className="cal-week-count">{total} install{total === 1 ? '' : 's'}</span>}
              </div>
            );
          })}

          {activeLanes.length === 0 && (
            <div className="cal-empty-week">Nothing booked this week.</div>
          )}

          {activeLanes.map((name) => {
            const idx = lanes.indexOf(name);
            const cls = laneClass(name, idx);
            const weekTotal = days.reduce((n, d) => n + (byDay.get(d)?.get(name) || []).length, 0);
            return (
              <div className="cal-lane-row" key={name}>
                <div className={`cal-lane-head ${cls}`}>
                  <span className="cal-lane-name">{name}</span>
                  <span className="cal-lane-count">{weekTotal} this week</span>
                </div>
                {days.map((d) => {
                  const jobs = byDay.get(d)?.get(name) || [];
                  return (
                    <div className={`cal-cell${jobs.length > 1 ? ' multi' : ''}`} key={`${name}-${d}`}>
                      {/* Two jobs for one firm on one day is the opening the
                          whole view exists for: they're already out, so a
                          nearby site may fit around them. */}
                      {jobs.length > 1 && (
                        <span className="cal-cell-flag">{jobs.length} jobs — already out</span>
                      )}
                      {jobs.map((p) => (
                        <JobBlock key={p.id} project={p} params={params} basePath={basePath} laneCls={cls} />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
