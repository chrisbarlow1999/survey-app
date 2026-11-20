'use client';

import { use, useEffect, useState } from 'react';
import { createClient } from '../../../../../lib/supabaseClient';
import { compressImage } from '../../../../../lib/compressImage';
import { SCREEN_SIZES } from '../../../../../lib/screenSizes';
import {
  AREA_STEPS, WALL_TYPES, POWER_DISTANCES, DATA_OPTIONS, OBSTRUCTIONS,
  freshSelfArea, selfAreaToDraft, selfAreaFromDraft, selfAreaToStored,
} from '../../../../../lib/selfSurveyGuide';
import { SelfSurveyIllustration } from '../../../../../components/SelfSurveyIllustration';
import { DraftBanner } from '../../../../../components/DraftBanner';
import { loadDraft, clearDraft, useDraftAutosave } from '../../../../../lib/formDraft';

// The guided self survey. Offered from a client's tracking link when the date
// they need the work by is within three weeks, so they don't wait for an
// engineer visit.
//
// Built like an insurance claim form rather than the engineer survey: one
// thing per screen, an example of what good looks like, and tips in plain
// language. What it produces is an ordinary survey row (survey_kind = 'self'),
// already linked to the project — see submit_self_survey() in migration 043.

function safeName(name) {
  return (name || 'photo.jpg').replace(/[^\w.\-]/g, '_');
}

function OptionList({ name, options, value, onChange }) {
  return (
    <div className="ss-options" role="radiogroup">
      {options.map((o) => (
        <label key={o.key} className={`ss-option${value === o.key ? ' on' : ''}`}>
          <input type="radio" name={name} value={o.key} checked={value === o.key} onChange={() => onChange(o.key)} />
          <span className="ss-option-label">{o.label}</span>
          {o.tip && <span className="ss-option-tip">{o.tip}</span>}
        </label>
      ))}
    </div>
  );
}

function PhotoField({ label, preview, onPick, onClear, required }) {
  return (
    <div className="ss-photo">
      {preview ? (
        <div className="ss-photo-preview">
          <img src={preview} alt={label} />
          <button type="button" className="btn btn-ghost" onClick={onClear}>Retake</button>
        </div>
      ) : (
        <label className="ss-photo-pick">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }}
          />
          <span className="ss-photo-icon" aria-hidden="true">📷</span>
          <span>{label}{required ? '' : ' (optional)'}</span>
          <span className="hint" style={{ margin: 0 }}>Take a photo or choose one from your phone</span>
        </label>
      )}
    </div>
  );
}

export default function SelfSurveyPage({ params, searchParams }) {
  const { token } = use(params);
  // ?site=<id> on a multi-site project (migration 044). Checked against the
  // project's own sites below, and again by submit_self_survey().
  const { site: siteParam } = use(searchParams) || {};
  const supabase = createClient();
  const draftKey = `self-survey-${token}${siteParam ? `-${siteParam}` : ''}`;

  const [project, setProject] = useState(null);
  const [site, setSite] = useState(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [you, setYou] = useState({ name: '', phone: '', siteContact: '', siteLocation: '', address: '', additionalInfo: '' });
  const [areas, setAreas] = useState([freshSelfArea()]);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    supabase.rpc('get_project_for_tracking', { p_token: token }).then(({ data }) => {
      setProject(data || null);
      if (data) {
        const s = (data.sites || []).find((x) => x.id === siteParam)
          // A single-site request has exactly one site; use it without a param.
          || ((data.sites || []).length === 1 ? data.sites[0] : null);
        setSite(s || null);
        setYou((y) => ({
          ...y,
          name: y.name || data.submission?.requested_by || '',
          siteLocation: y.siteLocation || s?.site_name || data.site_location || '',
          address: y.address || s?.address || data.address || '',
          siteContact: y.siteContact || [s?.manager_name, s?.manager_phone].filter(Boolean).join(', '),
        }));
      }
      setLookupDone(true);
    });
  }, [token, siteParam]);

  useEffect(() => { setDraft(loadDraft(draftKey)); }, [draftKey]);

  useDraftAutosave(
    draftKey,
    {
      you,
      areas: areas.map(selfAreaToDraft),
      hadPhotos: areas.some((a) => Object.keys(a.photos).length > 0),
    },
    // Not until they've left the first step: the details on it are pre-filled
    // from the project, which would otherwise count as a change and leave a
    // "you have an unfinished form" banner for someone who only looked.
    !done && page > 0
  );

  function restoreDraft() {
    setYou((y) => ({ ...y, ...draft.data.you }));
    setAreas((draft.data.areas || []).map(selfAreaFromDraft));
    setPage(0);
    setDraft(null);
  }
  function discardDraft() {
    clearDraft(draftKey);
    setDraft(null);
  }

  const pages = [
    { kind: 'you' },
    ...areas.flatMap((a, ai) => AREA_STEPS.map((step) => ({ kind: 'area', ai, step }))),
    { kind: 'review' },
  ];
  const current = pages[Math.min(page, pages.length - 1)];

  // Set while a location is open from the summary page ("+ Add another
  // location" or "Edit"), so Back and Cancel can return there directly.
  const [detour, setDetour] = useState(null);
  useEffect(() => {
    if (current.kind === 'review' && detour) setDetour(null);
  }, [current.kind, detour]);

  function updateArea(ai, patch) {
    setAreas((list) => list.map((a, i) => (i === ai ? { ...a, ...patch } : a)));
  }

  async function pickPhoto(ai, key, file) {
    if (!file) return;
    const small = await compressImage(file);
    setAreas((list) => list.map((a, i) => (i === ai
      ? { ...a, photos: { ...a.photos, [key]: small }, previews: { ...a.previews, [key]: URL.createObjectURL(small) } }
      : a)));
  }
  function clearPhoto(ai, key) {
    setAreas((list) => list.map((a, i) => {
      if (i !== ai) return a;
      const photos = { ...a.photos };
      const previews = { ...a.previews };
      delete photos[key];
      delete previews[key];
      return { ...a, photos, previews };
    }));
  }

  function checkYou() {
    if (!you.name.trim()) return 'Please tell us your name.';
    if (!you.phone.trim()) return 'Please give a phone number in case we have a question about a photo.';
    return '';
  }

  function goNext() {
    const problem = current.kind === 'you' ? checkYou() : current.kind === 'area' ? current.step.check(areas[current.ai]) : '';
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setPage((p) => Math.min(p + 1, pages.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function goBack() {
    setError('');
    // Back from the first step of a location opened from the summary returns
    // to the summary, rather than to the end of the previous location.
    if (detour && current.kind === 'area' && areas[current.ai]?.id === detour.areaId && current.step === AREA_STEPS[0]) {
      cancelDetour();
      return;
    }
    setPage((p) => Math.max(p - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function firstPageOfArea(ai) {
    return 1 + ai * AREA_STEPS.length;
  }
  function reviewPage(areaCount) {
    return 1 + areaCount * AREA_STEPS.length;
  }
  function addArea() {
    const ai = areas.length;
    const area = freshSelfArea();
    setAreas((list) => [...list, area]);
    setDetour({ mode: 'add', areaId: area.id });
    setError('');
    setPage(firstPageOfArea(ai));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function editArea(ai) {
    setDetour({ mode: 'edit', areaId: areas[ai].id });
    setError('');
    setPage(firstPageOfArea(ai));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  // Back to the summary from a location opened there. A location that was
  // being added is thrown away; one being edited keeps its changes (anything
  // left incomplete is flagged on the summary).
  function cancelDetour() {
    if (!detour) return;
    if (detour.mode === 'add') {
      const a = areas.find((x) => x.id === detour.areaId);
      const started = a && (a.name.trim() || Object.keys(a.photos).length > 0);
      if (started && !confirm("Discard this location? Anything you've entered for it will be lost.")) return;
    }
    leaveDetour();
  }
  function leaveDetour() {
    if (!detour) return;
    let count = areas.length;
    if (detour.mode === 'add') {
      setAreas((list) => list.filter((a) => a.id !== detour.areaId));
      count -= 1;
    }
    setDetour(null);
    setError('');
    setPage(reviewPage(count));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function removeArea(ai) {
    if (!confirm('Remove this location and its photos?')) return;
    setAreas((list) => list.filter((_, i) => i !== ai));
    // Stay on the review page, which has just moved up by one area's steps.
    setPage(1 + (areas.length - 1) * AREA_STEPS.length);
  }

  // Every step re-checked before sending, in case someone jumped around from
  // the review page.
  function firstProblem() {
    const y = checkYou();
    if (y) return { page: 0, message: y };
    for (let ai = 0; ai < areas.length; ai++) {
      for (let si = 0; si < AREA_STEPS.length; si++) {
        const m = AREA_STEPS[si].check(areas[ai]);
        if (m) return { page: firstPageOfArea(ai) + si, message: `${areas[ai].name || `Location ${ai + 1}`}: ${m}` };
      }
    }
    return null;
  }

  async function submit() {
    const problem = firstProblem();
    if (problem) {
      setError(problem.message);
      setPage(problem.page);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const locations = [];
      for (const area of areas) {
        const paths = {};
        for (const [key, file] of Object.entries(area.photos)) {
          const path = `self-survey/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName(file.name)}`;
          const { error: upErr } = await supabase.storage.from('survey-photos').upload(path, file, {
            contentType: file.type || 'image/jpeg',
          });
          if (upErr) throw upErr;
          paths[key] = path;
        }
        locations.push(selfAreaToStored(area, paths));
      }

      const { data: surveyId, error: rpcErr } = await supabase.rpc('submit_self_survey', {
        p_token: token,
        p_site_id: site?.id || null,
        p_survey: {
          name: you.name,
          phone: you.phone,
          site_contact: you.siteContact,
          site_location: you.siteLocation,
          address: you.address,
          additional_info: you.additionalInfo,
          locations,
        },
      });
      if (rpcErr) throw rpcErr;

      if (surveyId) {
        fetch('/api/notify-survey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ surveyId }),
        }).catch(() => {});
      }

      clearDraft(draftKey);
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      console.error(err);
      setError(
        /too many/i.test(err?.message || '')
          ? 'You have sent several self surveys in the last hour. Please wait a little and try again.'
          : 'Something went wrong sending your survey. Please check your connection and try again — nothing you entered has been lost.'
      );
    }
    setSubmitting(false);
  }

  if (!lookupDone) {
    return <main><div className="panel"><p className="hint">Loading…</p></div></main>;
  }

  if (!project) {
    return (
      <main>
        <div className="panel">
          <h2>This link isn&apos;t active</h2>
          <p className="hint">Please get in touch with your Linney contact for an up-to-date link.</p>
        </div>
      </main>
    );
  }

  if (!project.self_survey_eligible && !done) {
    return (
      <main>
        <div className="panel">
          <h2>Self survey isn&apos;t needed for this job</h2>
          <p className="hint">
            We&apos;ll arrange a survey with you. If your dates have changed and you need things to move faster,
            please contact your Linney contact.
          </p>
          <a className="btn btn-ghost" href={`/track/${token}`}>Back to your project page</a>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main>
        <div className="panel success-panel">
          <h2>Thank you — your survey has been sent</h2>
          <p className="hint">
            Our team will check your photos and measurements and be in touch if anything needs another look.
          </p>
          <a className="btn btn-primary" href={`/track/${token}`}>Back to your project page</a>
        </div>
      </main>
    );
  }

  const stepNumber = page + 1;
  const totalSteps = pages.length;

  return (
    <main className="ss-main">
      {draft && page === 0 && (
        <DraftBanner savedAt={draft.at} hadPhotos={draft.data?.hadPhotos} onRestore={restoreDraft} onDiscard={discardDraft} />
      )}

      <div className="ss-progress-head">
        <a href={`/track/${token}`} className="back-link" style={{ marginBottom: 0 }}>&larr; Project page</a>
        <span className="ss-progress-count">Step {stepNumber} of {totalSteps}</span>
      </div>
      <div className="tracking-progress" aria-hidden="true">
        <div className="tracking-progress-fill" style={{ width: `${Math.round((stepNumber / totalSteps) * 100)}%` }} />
      </div>

      {current.kind === 'you' && (
        <div className="panel">
          <div className="tracking-eyebrow">
            Self survey · {project.title}{site && (project.sites || []).length > 1 ? ` · ${site.site_name}` : ''}
          </div>
          <h2>Before you start</h2>
          <p className="hint">
            We&apos;ll walk you through each place a screen will go: a few photos, a couple of measurements and
            some quick questions. Around 10–15 minutes per location. You&apos;ll need your phone and a tape
            measure.
          </p>
          <div className="field-row">
            <div className="field"><label className="req">Your Name</label><input value={you.name} onChange={(e) => setYou({ ...you, name: e.target.value })} /></div>
            <div className="field"><label className="req">Phone Number</label><input type="tel" value={you.phone} onChange={(e) => setYou({ ...you, phone: e.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 2, minWidth: 220 }}><label>Site Name</label><input value={you.siteLocation} onChange={(e) => setYou({ ...you, siteLocation: e.target.value })} /></div>
            <div className="field" style={{ flex: 2, minWidth: 220 }}><label>Who should we contact on site?</label><input value={you.siteContact} onChange={(e) => setYou({ ...you, siteContact: e.target.value })} placeholder="Name and phone, if not you" /></div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}><label>Site Address</label><input value={you.address} onChange={(e) => setYou({ ...you, address: e.target.value })} /></div>
          </div>
        </div>
      )}

      {current.kind === 'area' && (() => {
        const { ai, step } = current;
        const area = areas[ai];
        const stepIdx = AREA_STEPS.indexOf(step);
        return (
          <div className="panel">
            <div className="tracking-eyebrow">
              Location {ai + 1}{area.name ? ` — ${area.name}` : ''} · {stepIdx + 1} of {AREA_STEPS.length}
            </div>
            <h2>{step.title}</h2>
            <p className="hint">{step.intro}</p>

            <div className="ss-example">
              <div className="ss-example-art">
                <SelfSurveyIllustration kind={step.illustration} image={step.exampleImage} alt={`Example: ${step.title}`} />
                <div className="ss-example-caption">Example</div>
              </div>
              <ul className="ss-tips">
                {step.tips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>

            {step.key === 'name' && (
              <div className="field">
                <label className="req">Location name</label>
                <input value={area.name} onChange={(e) => updateArea(ai, { name: e.target.value })} placeholder="e.g. Reception, behind the desk" maxLength={120} />
              </div>
            )}

            {step.key === 'wall' && (
              <OptionList name={`wall-${area.id}`} options={WALL_TYPES} value={area.wallType} onChange={(v) => updateArea(ai, { wallType: v })} />
            )}

            {step.key === 'measure' && (
              <div className="ss-measure-grid">
                {[
                  ['widthCm', 'Clear width (cm)'],
                  ['heightCm', 'Clear height (cm)'],
                  ['bottomCm', 'Bottom of screen from floor (cm)'],
                  ['ceilingCm', 'Floor to ceiling (cm)'],
                ].map(([key, label]) => (
                  <div className="field" key={key}>
                    <label>{label}</label>
                    <input type="number" inputMode="numeric" min="0" max="5000" value={area[key]} onChange={(e) => updateArea(ai, { [key]: e.target.value })} />
                  </div>
                ))}
              </div>
            )}

            {step.key === 'power' && (
              <OptionList name={`power-${area.id}`} options={POWER_DISTANCES} value={area.powerDistance} onChange={(v) => updateArea(ai, { powerDistance: v })} />
            )}

            {step.key === 'data' && (
              <OptionList name={`data-${area.id}`} options={DATA_OPTIONS} value={area.data} onChange={(v) => updateArea(ai, { data: v })} />
            )}

            {step.key === 'obstructions' && (
              <>
                <div className="ss-checks">
                  {OBSTRUCTIONS.map((o) => {
                    const on = area.obstructions.includes(o);
                    return (
                      <label key={o} className={`ss-option${on ? ' on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => updateArea(ai, {
                            obstructions: on ? area.obstructions.filter((x) => x !== o) : [...area.obstructions, o],
                          })}
                        />
                        <span className="ss-option-label">{o}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label>Anything else we should know?</label>
                  <textarea value={area.obstructionNotes} onChange={(e) => updateArea(ai, { obstructionNotes: e.target.value })} maxLength={1000} />
                </div>
              </>
            )}

            {step.key === 'screens' && (
              <>
                <div className="field-row">
                  <div className="field" style={{ maxWidth: 160 }}>
                    <label className="req">How many screens?</label>
                    <input type="number" inputMode="numeric" min="1" max="50" value={area.screenCount} onChange={(e) => updateArea(ai, { screenCount: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Screen size</label>
                    <select value={area.sizeKey} onChange={(e) => updateArea(ai, { sizeKey: e.target.value })}>
                      <option value="">Not sure — recommend one</option>
                      {Object.entries(SCREEN_SIZES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Orientation</label>
                    <select value={area.orientation} onChange={(e) => updateArea(ai, { orientation: e.target.value })}>
                      <option value="Landscape">Landscape (wide)</option>
                      <option value="Portrait">Portrait (tall)</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Anything else about this location?</label>
                  <textarea value={area.notes} onChange={(e) => updateArea(ai, { notes: e.target.value })} maxLength={1000} />
                </div>
              </>
            )}

            {step.photoKey && (
              <PhotoField
                label={step.photoLabel}
                preview={area.previews[step.photoKey]}
                required={step.key === 'wide'}
                onPick={(f) => pickPhoto(ai, step.photoKey, f)}
                onClear={() => clearPhoto(ai, step.photoKey)}
              />
            )}
          </div>
        );
      })()}

      {current.kind === 'review' && (
        <div className="panel">
          <h2>Check and send</h2>
          <p className="hint">Here&apos;s everything you&apos;ve told us. Add another location if a screen is going somewhere else too.</p>
          {areas.map((a, ai) => {
            const photoCount = Object.keys(a.photos).length;
            const problems = AREA_STEPS.map((s) => s.check(a)).filter(Boolean);
            return (
              <div className="ss-review-area" key={a.id}>
                {a.previews.wide && <img src={a.previews.wide} alt="" className="ss-review-thumb" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ss-review-title">{a.name || `Location ${ai + 1}`}</div>
                  <div className="hint" style={{ margin: 0 }}>
                    {a.screenCount || 0} screen{Number(a.screenCount) === 1 ? '' : 's'} · {photoCount} photo{photoCount === 1 ? '' : 's'}
                  </div>
                  {problems.length > 0 && <div className="error-text" style={{ margin: '4px 0 0' }}>{problems[0]}</div>}
                </div>
                <div className="ss-review-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => editArea(ai)}>Edit</button>
                  {areas.length > 1 && (
                    <button type="button" className="btn btn-danger" onClick={() => removeArea(ai)}>Remove</button>
                  )}
                </div>
              </div>
            );
          })}
          <button type="button" className="btn-add" onClick={addArea} style={{ marginTop: 6 }}>+ Add another location</button>
          <div className="field" style={{ marginTop: 16 }}>
            <label>Anything else you&apos;d like us to know?</label>
            <textarea value={you.additionalInfo} onChange={(e) => setYou({ ...you, additionalInfo: e.target.value })} maxLength={5000} />
          </div>
        </div>
      )}

      {error && <p className="error-text" role="alert">{error}</p>}

      {detour && current.kind === 'area' && areas[current.ai]?.id === detour.areaId && (
        <div className="ss-detour">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={cancelDetour}
          >
            {detour.mode === 'add' ? "Cancel — don't add this location" : 'Back to summary'}
          </button>
        </div>
      )}

      <div className="ss-nav">
        {page > 0 ? (
          <button type="button" className="btn btn-ghost" onClick={goBack} disabled={submitting}>Back</button>
        ) : <span />}
        {current.kind === 'review' ? (
          <button type="button" className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Sending… (uploading photos)' : 'Send survey'}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={goNext}>Next</button>
        )}
      </div>
    </main>
  );
}
