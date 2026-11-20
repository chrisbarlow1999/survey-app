'use client';

import { INTAKE_QUESTIONS } from '../lib/intakeQuestions';
import { IntakeQuestionFields } from './IntakeQuestionFields';
import { YesNo } from './YesNo';

// The fields for one site of a project (migration 044): where it is, who runs
// it, how to bill it, how to get in, and when we can work there. Used by the
// client request form and by the project page's add/edit site form.
//
// `site` is the form shape from freshSiteDetails() in lib/siteStatus.js.
// `idPrefix` keeps label/input ids unique when several sites are on one page.
export function SiteDetailsFields({ site, onChange, idPrefix, audience = 'client' }) {
  const set = (key) => (e) => onChange(key, e.target.value);
  const id = (key) => `${idPrefix}-${key}`;
  const you = audience === 'client';

  return (
    <div className="site-fields">
      <div className="field-row">
        <div className="field" style={{ flex: '2 1 220px' }}>
          <label className="req" htmlFor={id('name')}>Site Name</label>
          <input id={id('name')} value={site.site_name} onChange={set('site_name')} maxLength={200} placeholder="e.g. Saputo Leeds" />
        </div>
        <div className="field" style={{ flex: '1 1 140px' }}>
          <label htmlFor={id('screens')}>How Many Screens?</label>
          <input id={id('screens')} type="number" min="0" max="10000" step="1" value={site.screen_count} onChange={set('screen_count')} placeholder="If known" />
        </div>
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: '1 1 100%' }}>
          <label htmlFor={id('address')}>Site Address</label>
          <textarea id={id('address')} rows={2} value={site.address} onChange={set('address')} maxLength={500} placeholder="Street, town, postcode" />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={id('cc')}>Cost Centre</label>
          <input id={id('cc')} value={site.cost_centre} onChange={set('cost_centre')} maxLength={100} />
        </div>
        <div className="field">
          <label htmlFor={id('unit')}>Unit Number</label>
          <input id={id('unit')} value={site.unit_number} onChange={set('unit_number')} maxLength={100} />
        </div>
      </div>

      <div className="site-fields-group">Site Manager</div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={id('mname')}>Name</label>
          <input id={id('mname')} value={site.manager_name} onChange={set('manager_name')} maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor={id('mphone')}>Phone</label>
          <input id={id('mphone')} type="tel" value={site.manager_phone} onChange={set('manager_phone')} maxLength={50} />
        </div>
        <div className="field">
          <label htmlFor={id('memail')}>Email</label>
          <input id={id('memail')} type="email" value={site.manager_email} onChange={set('manager_email')} maxLength={200} />
        </div>
      </div>

      <div className="site-fields-group">Install Preferences</div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={id('hours')}>Opening Hours</label>
          <input id={id('hours')} value={site.opening_hours} onChange={set('opening_hours')} maxLength={500} placeholder="e.g. Mon–Sat 07:00–22:00, closed Sunday" />
        </div>
        <div className="field">
          <label htmlFor={id('prefs')}>Preferred Install Days / Times</label>
          <input id={id('prefs')} value={site.install_preferences} onChange={set('install_preferences')} maxLength={1000} placeholder="e.g. Sundays, or weekdays before 09:00" />
        </div>
      </div>

      <div className="site-fields-group">Site Access</div>
      <IntakeQuestionFields
        questions={INTAKE_QUESTIONS}
        answers={site.access_answers || {}}
        onChange={(key, value) => onChange('access_answers', { ...(site.access_answers || {}), [key]: value })}
      />
      <div className="intake-question">
        <label className="intake-question-label">
          {you ? 'Do you need RAMS (risk assessment and method statement) for this site?' : 'RAMS required for this site?'}
        </label>
        {you && (
          <p className="hint intake-question-hint">
            If yes, we&apos;ll prepare them and add them to your project page for you to download.
          </p>
        )}
        <YesNo value={site.rams_required} onChange={(v) => onChange('rams_required', v)} ariaLabel="RAMS required" />
      </div>

      <div className="field-row" style={{ marginTop: 12 }}>
        <div className="field" style={{ flex: '1 1 100%' }}>
          <label htmlFor={id('notes')}>Anything Else About This Site</label>
          <textarea id={id('notes')} value={site.notes} onChange={set('notes')} maxLength={2000} />
        </div>
      </div>
    </div>
  );
}
