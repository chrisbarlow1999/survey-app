'use client';

import { use, useEffect, useState } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { AttachmentPicker } from '../../../../components/AttachmentPicker';
import { uploadAttachments, newAttachmentItems } from '../../../../lib/uploadAttachments';
import { DraftBanner } from '../../../../components/DraftBanner';
import { loadDraft, clearDraft, useDraftAutosave } from '../../../../lib/formDraft';
import { INTAKE_QUESTIONS, answersToStore } from '../../../../lib/intakeQuestions';
import { YesNo } from '../../../../components/YesNo';
import { CopyLinkField } from '../../../../components/CopyLinkField';
import { SiteDetailsFields } from '../../../../components/SiteDetailsFields';
import { freshSiteDetails, ramsFromForm } from '../../../../lib/siteStatus';
import { withinSelfSurveyWindow, trackingPath, SELF_SURVEY_WINDOW_DAYS } from '../../../../lib/clientTracking';

const MAX_SITES = 50;

function newSite() {
  return { key: 'site_' + Math.random().toString(36).slice(2, 9), ...freshSiteDetails() };
}

// The client-facing request form. One shared set of fields for every client —
// the slug in the URL only decides which client the project lands against, and
// which name is shown at the top.
//
// A request is one project with one or more sites (migration 044). A rollout
// across three stores is three sites, each with its own address, cost centre,
// unit number, manager, access arrangements and RAMS.
//
// Everything goes in through submit_intake_request(), which creates the
// project and all its sites in one transaction and only for a client with
// intake switched on. Guessing a slug or a client_id gets you nothing.
export default function ClientRequestPage({ params }) {
  const { slug } = use(params);
  const supabase = createClient();

  const [client, setClient] = useState(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', requestedBy: '', requesterEmail: '', dueDate: '',
  });
  // 'Yes' | 'No'. Only changes how the sites are laid out — a single-site
  // request is still stored as one site.
  const [multiSite, setMultiSite] = useState('No');
  const [sites, setSites] = useState(() => [newSite()]);
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  // The private link to this request's tracking page. Null after a bot-trap
  // "success", which never created anything to track.
  const [trackingToken, setTrackingToken] = useState(null);
  const [submittedDue, setSubmittedDue] = useState('');
  const [draft, setDraft] = useState(null);

  // Bot deterrents. Both live in the browser and a script calling the API
  // directly skips them entirely — the real backstop is the rate-limit trigger
  // in migration 026. These only stop the cheap automated stuff.
  const [trap, setTrap] = useState('');
  const [openedAt] = useState(() => Date.now());

  // Keyed per client, so a Compass draft never surfaces on the Starbucks form.
  const draftKey = `request-${slug}`;

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, name, intake_enabled')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        setClient(data && data.intake_enabled ? data : null);
        setLookupDone(true);
      });
  }, [slug]);

  useEffect(() => { setDraft(loadDraft(draftKey)); }, [draftKey]);

  useDraftAutosave(draftKey, { form, multiSite, sites }, !done);

  function restoreDraft() {
    const d = draft.data;
    setForm((f) => ({ ...f, ...d.form }));
    if (Array.isArray(d.sites) && d.sites.length) {
      setSites(d.sites.map((s) => ({ ...newSite(), ...s })));
      setMultiSite(d.multiSite === 'Yes' || d.sites.length > 1 ? 'Yes' : 'No');
    } else if (d.form) {
      // A draft from before sites existed: its site fields become site 1.
      setSites([{
        ...newSite(),
        site_name: d.form.siteLocation || '',
        address: d.form.address || '',
        screen_count: d.form.screenCount || '',
        access_answers: d.answers || {},
        rams_required: typeof d.rams === 'string' ? d.rams : '',
      }]);
    }
    setDraft(null);
  }
  function discardDraft() {
    clearDraft(draftKey);
    setDraft(null);
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setSiteField(siteKey, key, value) {
    setSites((list) => list.map((s) => (s.key === siteKey ? { ...s, [key]: value } : s)));
  }
  function addSite() {
    setSites((list) => (list.length >= MAX_SITES ? list : [...list, newSite()]));
  }
  function removeSite(siteKey) {
    const s = sites.find((x) => x.key === siteKey);
    if (s && (s.site_name || s.address) && !confirm(`Remove ${s.site_name || 'this site'} from the request?`)) return;
    setSites((list) => list.filter((x) => x.key !== siteKey));
  }
  // The things most likely to be the same across a rollout. Name, address,
  // cost centre, unit and manager are deliberately not copied.
  function copyFromFirst(siteKey) {
    const first = sites[0];
    setSites((list) => list.map((s) => (s.key === siteKey ? {
      ...s,
      access_answers: { ...first.access_answers },
      rams_required: first.rams_required,
      opening_hours: first.opening_hours,
      install_preferences: first.install_preferences,
    } : s)));
  }
  function chooseMultiSite(value) {
    const next = value || 'No';
    if (next === 'Yes' && sites.length === 1) setSites((list) => [...list, newSite()]);
    if (next === 'No' && sites.length > 1) {
      if (!confirm(`Keep only the first site (${sites[0].site_name || 'Site 1'}) and remove the others?`)) return;
      setSites((list) => list.slice(0, 1));
    }
    setMultiSite(next);
  }

  const totalScreens = sites.reduce((n, s) => n + (Number(s.screen_count) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.requestedBy.trim()) {
      setError('Please give the request a title and tell us who to contact.');
      return;
    }
    const unnamed = sites.findIndex((s) => !s.site_name.trim());
    if (unnamed !== -1) {
      setError(sites.length > 1 ? `Please give site ${unnamed + 1} a name.` : 'Please give the site a name.');
      return;
    }
    // A filled honeypot, or a form completed impossibly fast, is a bot. Show
    // the normal success screen rather than an error — telling a bot why it
    // failed just helps it try again.
    if (trap || Date.now() - openedAt < 3000) {
      setDone(true);
      return;
    }
    setSubmitting(true);
    try {
      const savedAttachments = await uploadAttachments(supabase, attachments);
      const { data: token, error: rpcErr } = await supabase.rpc('submit_intake_request', {
        p_slug: slug,
        p_request: {
          title: form.title,
          description: form.description,
          requested_by: form.requestedBy,
          requester_email: form.requesterEmail,
          due_date: form.dueDate || null,
          attachments: savedAttachments,
          sites: sites.map((s) => ({
            site_name: s.site_name,
            address: s.address,
            cost_centre: s.cost_centre,
            unit_number: s.unit_number,
            manager_name: s.manager_name,
            manager_phone: s.manager_phone,
            manager_email: s.manager_email,
            screen_count: s.screen_count === '' ? null : String(s.screen_count),
            opening_hours: s.opening_hours,
            install_preferences: s.install_preferences,
            notes: s.notes,
            access_answers: answersToStore(INTAKE_QUESTIONS, s.access_answers || {}),
            rams_required: ramsFromForm(s.rams_required),
          })),
        },
      });
      if (rpcErr) throw rpcErr;
      clearDraft(draftKey);
      setTrackingToken(token);
      setSubmittedDue(form.dueDate);
      setDone(true);
    } catch (err) {
      console.error(err);
      setError(
        /too many requests/i.test(err?.message || '')
          ? 'A lot of requests have come in for this account in the last hour. Please try again a little later.'
          : 'Something went wrong sending your request. Please try again.'
      );
    }
    setSubmitting(false);
  }

  if (!lookupDone) {
    return <main><div className="panel"><p className="hint">Loading…</p></div></main>;
  }

  // Deliberately vague: an unknown slug and a slug with intake switched off
  // look identical, so this page can't be used to probe which clients exist.
  if (!client) {
    return (
      <main>
        <div className="panel">
          <h2>Request form unavailable</h2>
          <p className="hint">
            This link isn&apos;t active. Please check the address, or get in touch with your Linney contact
            for an up-to-date one.
          </p>
        </div>
      </main>
    );
  }

  if (done) {
    const offerSelfSurvey = trackingToken && withinSelfSurveyWindow(submittedDue);
    return (
      <main>
        <div className="panel success-panel">
          <h2>Thank you — your request has been sent</h2>
          <p className="hint">
            It&apos;s gone through to the {client.name} team, who&apos;ll pick it up from here.
          </p>
          {trackingToken && (
            <>
              <div className="tracking-callout">
                <div className="tracking-callout-title">Save this link</div>
                <p className="hint" style={{ margin: '0 0 10px' }}>
                  It&apos;s your private page for this job: progress{sites.length > 1 ? ' for every site' : ''}, key
                  dates, documents and anything we need from you. Bookmark it or copy it somewhere safe — it
                  isn&apos;t sent anywhere else, and anyone with the link can see the page.
                </p>
                <CopyLinkField path={trackingPath(trackingToken)} />
              </div>
              {offerSelfSurvey && (
                <div className="tracking-callout tracking-callout-urgent">
                  <div className="tracking-callout-title">Your date is within {SELF_SURVEY_WINDOW_DAYS / 7} weeks</div>
                  <p className="hint" style={{ margin: '0 0 10px' }}>
                    To save time, you can survey {sites.length > 1 ? 'each site' : 'the site'} yourself instead of
                    waiting for an engineer visit. We&apos;ll guide you through each photo and measurement — about
                    15 minutes per screen location, on your phone. From your project page you can start it
                    yourself, or send each site&apos;s survey to its manager — that link shows them the survey only.
                  </p>
                  <a className="btn btn-primary" href={trackingPath(trackingToken)}>Self survey options</a>
                </div>
              )}
              <div className="actions-row" style={{ justifyContent: 'flex-start', marginBottom: 0, marginTop: 14 }}>
                <a className="btn btn-primary" href={trackingPath(trackingToken)}>Go to your project page</a>
                <button className="btn btn-ghost" onClick={() => window.location.reload()}>Send another request</button>
              </div>
            </>
          )}
          {!trackingToken && (
            <button className="btn btn-ghost" onClick={() => window.location.reload()}>Send another request</button>
          )}
        </div>
      </main>
    );
  }

  const isMulti = multiSite === 'Yes';

  return (
    <main>
      {draft && (
        <DraftBanner savedAt={draft.at} onRestore={restoreDraft} onDiscard={discardDraft} />
      )}
      <form onSubmit={handleSubmit}>
        {/* Honeypot: hidden from people, irresistible to form-filling bots.
            aria-hidden and tabIndex keep it away from screen readers and the
            keyboard, so a real user can never fill it by accident. */}
        <div className="honeypot" aria-hidden="true">
          <label htmlFor="company-website">Company website</label>
          <input
            id="company-website"
            type="text"
            name="company_website"
            tabIndex={-1}
            autoComplete="off"
            value={trap}
            onChange={(e) => setTrap(e.target.value)}
          />
        </div>

        <div className="panel">
          <h2>New Request — {client.name}</h2>
          <p className="hint">Tell us what you need and we&apos;ll come back to you. Nothing here needs an account.</p>
          <div className="field-row">
            <div className="field" style={{ flex: '3 1 260px' }}>
              <label className="req" htmlFor="req-title">What do you need?</label>
              <input id="req-title" value={form.title} onChange={(e) => setField('title', e.target.value)} maxLength={300} placeholder="e.g. Menu screens for three stores" />
            </div>
            <div className="field" style={{ flex: '1 1 170px' }}>
              <label htmlFor="req-due">Needed By</label>
              <input id="req-due" type="date" min="2000-01-01" max="2100-12-31" value={form.dueDate} onChange={(e) => setField('dueDate', e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label htmlFor="req-details">Details</label>
              <textarea id="req-details" value={form.description} onChange={(e) => setField('description', e.target.value)} maxLength={5000} placeholder="Anything useful about the job as a whole — what the screens are for, any deadlines, budget." />
            </div>
          </div>
          {withinSelfSurveyWindow(form.dueDate) && (
            <p className="hint tracking-inline-note">
              That&apos;s within {SELF_SURVEY_WINDOW_DAYS / 7} weeks. Once you send this, you&apos;ll be able
              to survey {isMulti ? 'each site' : 'the site'} yourself so we can move faster — we&apos;ll show you how.
            </p>
          )}
          <div className="intake-question" style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <label className="intake-question-label">Is this for more than one site?</label>
            <p className="hint intake-question-hint">
              For a rollout across several locations — each site gets its own address, cost centre, manager and
              access details.
            </p>
            <YesNo value={multiSite} onChange={chooseMultiSite} ariaLabel="More than one site" />
          </div>
        </div>

        {sites.map((site, i) => (
          <div className="panel site-panel" key={site.key}>
            <div className="site-panel-head">
              <h2 style={{ margin: 0 }}>
                {isMulti ? `Site ${i + 1}` : 'The Site'}
                {isMulti && site.site_name ? <span className="area-screen-count">{site.site_name}</span> : null}
              </h2>
              <div className="site-panel-actions">
                {isMulti && i > 0 && (
                  <button type="button" className="btn btn-ghost" onClick={() => copyFromFirst(site.key)} title="Copy access answers, RAMS, opening hours and install preferences from site 1">
                    Copy access &amp; hours from site 1
                  </button>
                )}
                {isMulti && sites.length > 1 && (
                  <button type="button" className="btn btn-danger" onClick={() => removeSite(site.key)}>Remove</button>
                )}
              </div>
            </div>
            <SiteDetailsFields
              site={site}
              idPrefix={site.key}
              onChange={(key, value) => setSiteField(site.key, key, value)}
            />
          </div>
        ))}

        {isMulti && (
          <div className="site-add-row">
            <button type="button" className="btn-add" onClick={addSite} disabled={sites.length >= MAX_SITES}>
              + Add another site
            </button>
            <span className="hint" style={{ margin: 0 }}>
              {sites.length} site{sites.length === 1 ? '' : 's'}
              {totalScreens ? ` · ${totalScreens} screen${totalScreens === 1 ? '' : 's'} in total` : ''}
            </span>
          </div>
        )}

        <div className="panel">
          <h2>Your Details</h2>
          <div className="field-row">
            <div className="field"><label className="req" htmlFor="req-name">Your Name</label><input id="req-name" value={form.requestedBy} onChange={(e) => setField('requestedBy', e.target.value)} maxLength={200} /></div>
            <div className="field"><label htmlFor="req-email">Your Email</label><input id="req-email" type="email" value={form.requesterEmail} onChange={(e) => setField('requesterEmail', e.target.value)} maxLength={200} /></div>
          </div>
        </div>

        <div className="panel">
          <h2>Attachments</h2>
          <p className="hint">Floor plans, photos, a brief — anything that helps.</p>
          <div className="field-row">
            <AttachmentPicker
              attachments={attachments}
              onAdd={(files) => setAttachments((a) => [...a, ...newAttachmentItems(files)])}
              onRemove={(key) => setAttachments((a) => a.filter((x) => x.key !== key))}
              label="Files"
              hint="PDFs, images, spreadsheets — up to 10MB each."
            />
          </div>
        </div>

        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="actions-row">
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : isMulti ? `Send Request (${sites.length} sites)` : 'Send Request'}
          </button>
        </div>
      </form>
    </main>
  );
}
