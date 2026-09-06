'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { logProjectActivity } from '../lib/logProjectActivity';
import { formatDate } from '../lib/formatDate';
import { INCLUSION_REASON, screenCountOf } from '../lib/surveyScreens';

// Which of a project's surveys feed the screen figures, and a way to overrule
// it. The automatic rule keeps the latest survey for each site (see
// lib/surveyScreens.js); this panel shows what it decided and why, so a wrong
// call is visible rather than buried in a total that looks slightly off.
//
// It only appears when a project has a linked survey — on the many projects
// with one survey and no argument, it's one line confirming the obvious.
export function SurveyCountPanel({ projectId, entries, actorName, readOnly }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const counted = entries.filter((e) => e.counted);
  const total = counted.reduce((n, e) => n + screenCountOf(e.survey), 0);
  // Worth pointing out: with one survey there is nothing to supersede, so the
  // controls are just noise.
  const contested = entries.length > 1;

  async function setCounts(survey, value) {
    setBusy(survey.id);
    setError('');
    const { data, error: updErr } = await supabase
      .from('surveys')
      .update({ counts_in_totals: value })
      .eq('id', survey.id)
      .select('id');

    if (updErr) {
      console.error(updErr);
      setError('Could not change that.');
      setBusy(null);
      return;
    }
    // An update matching no rows returns no error — it just does nothing.
    if (!data || data.length === 0) {
      setError('That change was refused — you may not have edit access to this survey.');
      setBusy(null);
      return;
    }

    const where = survey.site_location || 'Untitled site';
    await logProjectActivity(supabase, {
      projectId,
      actorName,
      action: 'Survey counting changed',
      detail: value === null
        ? `${where} — back to the automatic rule`
        : `${where} — ${value ? 'counted' : 'not counted'} in screen totals`,
    });

    setBusy(null);
    router.refresh();
  }

  return (
    <div className="panel">
      <h2>
        Surveyed screens
        <span className="panel-count">{total}</span>
      </h2>
      <p className="hint">
        {contested
          ? 'Where a site has been surveyed more than once, only the latest counts — a re-survey replaces what came before it. If instead the site was surveyed in phases, count them both.'
          : 'The screens recorded on this project’s survey. This is what feeds the Screens view.'}
      </p>

      {error && <p className="error-text">{error}</p>}

      {entries.map(({ survey, counted: isCounted, reason }) => (
        <div className={`survey-count-row${isCounted ? '' : ' muted'}`} key={survey.id}>
          <div>
            <div className="site">
              <a href={`/dashboard/${survey.id}`}>{survey.site_location || 'Untitled site'}</a>
              <span className="client-badge">{screenCountOf(survey)} screen{screenCountOf(survey) === 1 ? '' : 's'}</span>
            </div>
            <div className="meta">
              {survey.survey_date ? formatDate(survey.survey_date) : 'No date'} · {INCLUSION_REASON[reason]}
            </div>
          </div>
          {!readOnly && contested && (
            <select
              className="inline-select"
              disabled={busy === survey.id}
              value={survey.counts_in_totals === true ? 'in' : survey.counts_in_totals === false ? 'out' : 'auto'}
              onChange={(e) => {
                const v = e.target.value;
                setCounts(survey, v === 'auto' ? null : v === 'in');
              }}
            >
              <option value="auto">Automatic</option>
              <option value="in">Always count</option>
              <option value="out">Never count</option>
            </select>
          )}
        </div>
      ))}
    </div>
  );
}
