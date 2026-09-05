'use client';

import { use, useEffect, useState } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { AttachmentPicker } from '../../../../components/AttachmentPicker';
import { uploadAttachments, newAttachmentItems } from '../../../../lib/uploadAttachments';
import { DraftBanner } from '../../../../components/DraftBanner';
import { loadDraft, clearDraft, useDraftAutosave } from '../../../../lib/formDraft';

// The client-facing request form. One shared set of fields for every client —
// the slug in the URL only decides which client the project lands against, and
// which name is shown at the top.
//
// The RLS policy in migration 018 is what actually enforces this: an anonymous
// insert is only accepted as a 'new', intake-sourced project against a client
// with intake_enabled. Guessing a client_id gets you nothing.
export default function ClientRequestPage({ params }) {
  const { slug } = use(params);
  const supabase = createClient();

  const [client, setClient] = useState(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [form, setForm] = useState({
    title: '', siteLocation: '', address: '', description: '',
    requestedBy: '', requesterEmail: '', dueDate: '', screenCount: '',
  });
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState(null);

  // Bot deterrents. Both live in the browser and a script hitting PostgREST
  // directly skips them entirely — the real backstop is the rate-limit trigger
  // in migration 026. These only stop the cheap automated stuff.
  const [trap, setTrap] = useState("");
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

  useDraftAutosave(draftKey, { form }, !done);

  function restoreDraft() {
    setForm((f) => ({ ...f, ...draft.data.form }));
    setDraft(null);
  }
  function discardDraft() {
    clearDraft(draftKey);
    setDraft(null);
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.title || !form.requestedBy) {
      setError('Please give the request a title and tell us who to contact.');
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
      const { error: insertErr } = await supabase.from('projects').insert({
        client_id: client.id,
        title: form.title,
        site_location: form.siteLocation || null,
        address: form.address || null,
        description: form.description || null,
        requested_by: form.requestedBy,
        requester_email: form.requesterEmail || null,
        due_date: form.dueDate || null,
        screen_count: form.screenCount === '' ? null : Number(form.screenCount),
        attachments: savedAttachments,
        source: 'intake',
        status: 'new',
      });
      if (insertErr) throw insertErr;
      clearDraft(draftKey);
      setDone(true);
    } catch (err) {
      console.error(err);
      setError('Something went wrong sending your request. Please try again.');
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
            This link isn't active. Please check the address, or get in touch with your Linney contact
            for an up-to-date one.
          </p>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main>
        <div className="panel success-panel">
          <h2>Request sent</h2>
          <p className="hint">Thanks — this has gone through to the {client.name} team, who'll pick it up from here.</p>
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>Send another request</button>
        </div>
      </main>
    );
  }

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
          <p className="hint">Tell us what you need and we'll come back to you. Nothing here needs an account.</p>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label className="req">What do you need?</label>
              <input value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="e.g. New screen for the Leeds branch" />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 2, minWidth: 220 }}>
              <label>Site Name</label>
              <input value={form.siteLocation} onChange={(e) => setField('siteLocation', e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label>Needed By</label>
              <input type="date" min="2000-01-01" max="2100-12-31" value={form.dueDate} onChange={(e) => setField('dueDate', e.target.value)} />
            </div>
            {/* Capped at 500 here rather than 10,000: the RLS policy in
                migration 029 refuses anything higher from an anonymous
                submitter, so the box shouldn't accept what the database
                will throw back. */}
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>How Many Screens?</label>
              <input
                type="number"
                min="0"
                max="500"
                step="1"
                placeholder="If you know"
                value={form.screenCount}
                onChange={(e) => setField('screenCount', e.target.value)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Site Address</label>
              <input value={form.address} onChange={(e) => setField('address', e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Details</label>
              <textarea value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="Anything useful — how many screens, where they'd go, any deadlines." />
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>Your Details</h2>
          <div className="field-row">
            <div className="field"><label className="req">Your Name</label><input value={form.requestedBy} onChange={(e) => setField('requestedBy', e.target.value)} /></div>
            <div className="field"><label>Your Email</label><input type="email" value={form.requesterEmail} onChange={(e) => setField('requesterEmail', e.target.value)} /></div>
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

        {error && <p className="error-text">{error}</p>}
        <div className="actions-row">
          <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send Request'}</button>
        </div>
      </form>
    </main>
  );
}
