import { createClient } from '../../../../lib/supabaseServer';
import { applyArchiveFilter } from '../../../../components/ArchiveFilter';
import { isClosed } from '../../../../lib/projectStatus';
import { ProjectViewTabs } from '../../../../components/ProjectViewTabs';
import { ProjectFilters } from '../../../../components/ProjectFilters';
import { screenTotals } from '../../../../lib/screenCount';
import { screensFromSurveys, screenMix, mountMix, surveyInclusion } from '../../../../lib/surveyScreens';

export const dynamic = 'force-dynamic';

// What hardware the pipeline actually needs, by model.
//
// The screen COUNT on a project is a forecast a PM types in. The screen MIX
// can only come from a survey, because that's where a size and a mount type
// are recorded. So this page reports two different numbers on purpose, and
// says which is which — the gap between them is the work that's been won but
// not yet specified, which is exactly what procurement needs to know about.
export default async function ProjectScreensPage({ searchParams }) {
  const params = (await searchParams) || {};
  const q = (params.q || '').trim();
  const clientId = params.client || '';
  const status = params.status || '';
  const owner = params.owner || '';
  const archived = params.archived || '';
  const hasFilters = Boolean(q || clientId || status || owner || archived);

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

  const [{ data: projects, error }, { data: clients }, { data: owners }, { count: orphanSurveys }] =
    await Promise.all([
      applyFilters(supabase.from('projects').select('id, title, status, screen_count')),
      supabase.from('clients').select('id, name').order('name', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email').in('role', ['user', 'super_admin']).eq('active', true).order('full_name', { ascending: true }),
      // Surveys nobody has attached to a project can't appear in any of this.
      // Saying so is the difference between a report that's incomplete and a
      // report that's wrong.
      supabase.from('surveys').select('id', { count: 'exact', head: true })
        .is('project_id', null).is('archived_at', null),
    ]);

  const rows = projects || [];
  const open = rows.filter((p) => !isClosed(p.status));
  const forecast = screenTotals(rows);

  // Only surveys hanging off the projects the filters matched.
  const ids = rows.map((r) => r.id);
  let surveys = [];
  // Captured, not discarded: a failed query returns { data: null } without
  // throwing, and an empty breakdown reads identically to "no surveys linked
  // yet" — which sends you looking at the linking rather than the error.
  let surveysError = null;
  if (ids.length) {
    const { data, error: sErr } = await supabase
      .from('surveys')
      .select('id, project_id, site_location, survey_date, submitted_at, counts_in_totals, locations')
      .in('project_id', ids)
      .is('archived_at', null);
    surveys = data || [];
    surveysError = sErr || null;
  }

  // Re-surveys replace, they don't add. Only the latest survey for each site
  // counts — otherwise a site surveyed twice contributes its screens twice and
  // the procurement figure comes out high. A PM can overrule that per survey
  // on the project page, for a site surveyed in phases rather than re-surveyed.
  const { kept, superseded, excluded } = surveyInclusion(surveys);
  const screens = screensFromSurveys(kept);
  const mix = screenMix(screens);
  const mounts = mountMix(screens);
  const specifiedProjects = new Set(screens.map((s) => s.projectId).filter(Boolean)).size;
  const unspecified = rows.length - specifiedProjects;

  return (
    <main className="project-main">
      <ProjectViewTabs current="screens" params={params} />

      <div className="stats-strip">
        <div className="stat-tile">
          <div className="stat-value">{forecast.total}</div>
          <div className="stat-label">{hasFilters ? 'Screens Matching' : 'Screens In Pipeline'}</div>
          <div className="stat-note">Forecast, from {rows.length} project{rows.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{screens.length}</div>
          <div className="stat-label">Screens Specified</div>
          <div className="stat-note">Surveyed, with a size and a model</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{unspecified}</div>
          <div className="stat-label">Projects Not Surveyed</div>
          <div className="stat-note">No model breakdown available yet</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{open.length}</div>
          <div className="stat-label">Open Projects</div>
        </div>
      </div>

      <ProjectFilters params={params} clients={clients} owners={owners} basePath="/projects/screens" showSort={false} />

      {error && (
        <div className="panel"><p className="error-text">Could not load projects: {error.message}</p></div>
      )}

      <div className="panel">
        <h2>Screens by model</h2>
        <p className="hint">
          Every screen on the <strong>latest</strong> survey for each site attached to these projects,
          grouped by size. Where a site has been surveyed more than once, only the most recent
          counts — a re-survey replaces what came before it rather than adding to it. This is the
          procurement view, so a forecast screen count with no survey behind it doesn&apos;t appear:
          a size only exists once an engineer has been on site.
        </p>
        {surveysError && (
          <p className="error-text">
            Could not load surveys: {surveysError.message}. This breakdown is empty because the query
            failed, not because no surveys are linked.
          </p>
        )}
        {!surveysError && mix.length === 0 && (
          <div className="empty-state">
            No surveyed screens for these projects. Link a survey to a project on the survey&apos;s own
            page and it will show up here.
          </div>
        )}
        {mix.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Model</th>
                  <th className="num">Screens</th>
                  <th className="num">Projects</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {mix.map((m) => (
                  <tr key={m.size}>
                    <td>{m.label}</td>
                    <td>{m.model}</td>
                    <td className="num">{m.count}</td>
                    <td className="num">{m.projects}</td>
                    <td>
                      {/* A bar rather than a percentage: the useful question is
                          which model dominates, not whether it's 34% or 36%. */}
                      <span className="mix-bar" aria-hidden="true">
                        <span
                          className="mix-bar-fill"
                          style={{ width: `${Math.round((m.count / screens.length) * 100)}%` }}
                        />
                      </span>
                      <span className="mix-share">{Math.round((m.count / screens.length) * 100)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total specified</td>
                  <td className="num">{screens.length}</td>
                  <td className="num">{specifiedProjects}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {mounts.length > 0 && (
        <div className="panel">
          <h2>Mount types</h2>
          <p className="hint">Brackets and mounts across the same surveyed screens.</p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mount</th>
                  <th className="num">Screens</th>
                </tr>
              </thead>
              <tbody>
                {mounts.map((m) => (
                  <tr key={m.mount}>
                    <td>{m.mount}</td>
                    <td className="num">{m.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(superseded > 0 || excluded > 0) && (
        <div className="panel">
          <p className="hint" style={{ margin: 0 }}>
            {superseded > 0 && (
              <>
                {superseded} earlier survey{superseded === 1 ? ' was' : 's were'} left out, replaced by a
                newer survey for the same site.{' '}
              </>
            )}
            {excluded > 0 && (
              <>
                {excluded} survey{excluded === 1 ? ' was' : 's were'} excluded by hand.{' '}
              </>
            )}
            Change either on the project&apos;s own page, under Surveyed screens.
          </p>
        </div>
      )}

      {(orphanSurveys || 0) > 0 && (
        <div className="panel">
          <p className="hint" style={{ margin: 0 }}>
            {orphanSurveys} survey{orphanSurveys === 1 ? ' is' : 's are'} not linked to any project, so
            {orphanSurveys === 1 ? ' its screens are' : ' their screens are'} not counted above. Link
            them from each survey&apos;s own page.
          </p>
        </div>
      )}
    </main>
  );
}
