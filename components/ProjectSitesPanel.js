'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { logProjectActivity } from '../lib/logProjectActivity';
import { uploadAttachments, newAttachmentItems } from '../lib/uploadAttachments';
import { formatBytes } from '../lib/formatBytes';
import { formatDate } from '../lib/formatDate';
import { describeAnswers, answersToStore, INTAKE_QUESTIONS, ramsLabel } from '../lib/intakeQuestions';
import {
  SITE_STATUSES, siteStatusLabel, siteStatusTone, siteStageCounts,
  freshSiteDetails, ramsToForm, ramsFromForm,
} from '../lib/siteStatus';
import { MAX_ATTACHMENT_BYTES } from './AttachmentPicker';
import { SiteDetailsFields } from './SiteDetailsFields';

function siteToForm(site) {
  const f = freshSiteDetails();
  for (const k of Object.keys(f)) {
    if (k === 'rams_required') f[k] = ramsToForm(site.rams_required);
    else if (k === 'access_answers') f[k] = site.access_answers || {};
    else if (k === 'screen_count') f[k] = site.screen_count ?? '';
    else f[k] = site[k] || '';
  }
  return f;
}

function formToRow(f) {
  const text = (v, max) => {
    const t = (v || '').trim();
    return t ? t.slice(0, max) : null;
  };
  const screens = String(f.screen_count).trim();
  return {
    site_name: (f.site_name || '').trim().slice(0, 200),
    address: text(f.address, 500),
    cost_centre: text(f.cost_centre, 100),
    unit_number: text(f.unit_number, 100),
    manager_name: text(f.manager_name, 200),
    manager_phone: text(f.manager_phone, 50),
    manager_email: text(f.manager_email, 200),
    screen_count: screens === '' ? null : Math.max(0, Math.min(10000, Math.round(Number(screens)) || 0)),
    opening_hours: text(f.opening_hours, 500),
    install_preferences: text(f.install_preferences, 1000),
    notes: text(f.notes, 2000),
    access_answers: answersToStore(INTAKE_QUESTIONS, f.access_answers || {}),
    rams_required: ramsFromForm(f.rams_required),
  };
}

function Detail({ label, children }) {
  if (children == null || children === '') return null;
  return (
    <div className="kv"><div className="k">{label}</div><div className="v" style={{ whiteSpace: 'pre-wrap' }}>{children}</div></div>
  );
}

// The locations of a project (migration 044). One card per site with its own
// stage and install date, editable in place like the rest of the project page;
// the full details open underneath. A project with no sites is a plain
// single-site project using the fields above — adding a site here turns it into
// a site-based one.
export function ProjectSitesPanel({ project, sites, surveysBySite, actorName, readOnly }) {
  const supabase = createClient();
  const router = useRouter();
  const [openId, setOpenId] = useState(sites.length === 1 ? sites[0].id : null);
  const [editingId, setEditingId] = useState(null); // site id, 'new', or null
  const [draft, setDraft] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const totalScreens = sites.reduce((n, s) => n + (s.screen_count || 0), 0);
  const stageCounts = siteStageCounts(sites);

  async function log(action, detail) {
    await logProjectActivity(supabase, { projectId: project.id, actorName, action, detail });
  }

  async function patch(site, values, action, detail) {
    setBusyId(site.id);
    setError('');
    const { error: updErr } = await supabase.from('project_sites').update(values).eq('id', site.id);
    if (updErr) {
      console.error(updErr);
      setError(`Could not update ${site.site_name}.`);
      setBusyId(null);
      return false;
    }
    if (action) await log(action, detail);
    setBusyId(null);
    router.refresh();
    return true;
  }

  function startAdd() {
    // The first site of a project that had none starts from the project's own
    // details, so converting a single-site job doesn't mean retyping it.
    const base = freshSiteDetails();
    if (sites.length === 0) {
      base.site_name = project.site_location || '';
      base.address = project.address || '';
      base.screen_count = project.screen_count ?? '';
      base.access_answers = project.intake_answers || {};
      base.rams_required = ramsToForm(project.rams_required);
    }
    setDraft(base);
    setEditingId('new');
    setError('');
  }

  function startEdit(site) {
    setDraft(siteToForm(site));
    setEditingId(site.id);
    setOpenId(site.id);
    setError('');
  }

  async function saveDraft() {
    if (!draft.site_name.trim()) {
      setError('A site needs a name.');
      return;
    }
    const row = formToRow(draft);
    setBusyId(editingId);
    setError('');
    if (editingId === 'new') {
      const position = sites.length ? Math.max(...sites.map((s) => s.position || 0)) + 1 : 0;
      const { error: insErr } = await supabase.from('project_sites').insert({ ...row, project_id: project.id, position });
      if (insErr) {
        console.error(insErr);
        setError('Could not add that site.');
        setBusyId(null);
        return;
      }
      await log('Site added', row.site_name);
    } else {
      const { error: updErr } = await supabase.from('project_sites').update(row).eq('id', editingId);
      if (updErr) {
        console.error(updErr);
        setError('Could not save that site.');
        setBusyId(null);
        return;
      }
      await log('Site details updated', row.site_name);
    }
    setBusyId(null);
    setEditingId(null);
    setDraft(null);
    router.refresh();
  }

  async function removeSite(site) {
    const linked = (surveysBySite[site.id] || []).length;
    const msg = `Remove ${site.site_name} from this project?${linked ? ` Its ${linked} linked survey${linked === 1 ? '' : 's'} stay on the project, just not assigned to a site.` : ''} Its RAMS files are deleted.`;
    if (!confirm(msg)) return;
    setBusyId(site.id);
    const { error: delErr } = await supabase.from('project_sites').delete().eq('id', site.id);
    if (delErr) {
      console.error(delErr);
      setError(`Could not remove ${site.site_name}.`);
      setBusyId(null);
      return;
    }
    const paths = (site.rams_files || []).map((f) => f.path).filter(Boolean);
    if (paths.length) supabase.storage.from('survey-photos').remove(paths).catch(() => {});
    await log('Site removed', site.site_name);
    setBusyId(null);
    router.refresh();
  }

  async function addRams(site, fileList) {
    if (!fileList || !fileList.length) return;
    const picked = Array.from(fileList);
    const ok = picked.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    const tooBig = picked.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    setError(tooBig.length ? `Skipped ${tooBig.map((f) => f.name).join(', ')} — over ${formatBytes(MAX_ATTACHMENT_BYTES)}.` : '');
    if (!ok.length) return;
    setBusyId(site.id);
    try {
      const uploaded = await uploadAttachments(supabase, newAttachmentItems(ok));
      const stored = (site.rams_files || []).map(({ url, ...rest }) => rest);
      const { error: updErr } = await supabase
        .from('project_sites')
        .update({ rams_files: [...stored, ...uploaded] })
        .eq('id', site.id);
      if (updErr) throw updErr;
      await log('RAMS uploaded', `${site.site_name}: ${ok.map((f) => f.name).join(', ')}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Could not upload that file.');
    }
    setBusyId(null);
  }

  async function removeRams(site, file) {
    if (!confirm(`Remove ${file.name}? The client will no longer be able to download it, and the file is deleted.`)) return;
    const next = (site.rams_files || []).filter((f) => f.path !== file.path).map(({ url, ...rest }) => rest);
    const ok = await patch(site, { rams_files: next }, 'RAMS removed', `${site.site_name}: ${file.name}`);
    if (ok) supabase.storage.from('survey-photos').remove([file.path]).catch(() => {});
  }

  const editor = (key) => (
    <div className="site-editor">
      <SiteDetailsFields
        site={draft}
        idPrefix={`edit-${key}`}
        audience="staff"
        onChange={(k, v) => setDraft((d) => ({ ...d, [k]: v }))}
      />
      <div className="actions-row" style={{ marginBottom: 0 }}>
        <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setDraft(null); setError(''); }} disabled={busyId === editingId}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={saveDraft} disabled={busyId === editingId}>
          {busyId === editingId ? 'Saving…' : editingId === 'new' ? 'Add site' : 'Save site'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="panel">
      <h2>
        Sites
        {sites.length > 0 && <span className="panel-count">{sites.length}</span>}
        {totalScreens > 0 && <span className="area-screen-count">{totalScreens} screen{totalScreens === 1 ? '' : 's'}</span>}
      </h2>

      {sites.length === 0 && editingId !== 'new' && (
        <p className="hint">
          A single-site project, using the site name and address above. Add sites to track a rollout location by
          location — each with its own address, cost centre, unit number, manager, stage and install date.
        </p>
      )}

      {sites.length > 1 && (
        <div className="site-stage-strip">
          {stageCounts.map((s) => (
            <span key={s.key} className={`status-pill status-${s.tone}`}>{s.count} {s.label.toLowerCase()}</span>
          ))}
        </div>
      )}

      <div className="site-list">
        {sites.map((site, i) => {
          const open = openId === site.id;
          const answers = describeAnswers(site.access_answers);
          const linked = surveysBySite[site.id] || [];
          const ramsMissing = site.rams_required === true && (site.rams_files || []).length === 0;
          const busy = busyId === site.id;
          return (
            <div className={`site-card${open ? ' open' : ''}`} key={site.id}>
              <div className="site-card-head">
                <button type="button" className="site-card-toggle" onClick={() => setOpenId(open ? null : site.id)} aria-expanded={open}>
                  <span className="site-card-num">{i + 1}</span>
                  <span className="site-card-title">
                    <span className="site-card-name">{site.site_name}</span>
                    <span className="site-card-meta">
                      {[site.cost_centre && `CC ${site.cost_centre}`, site.unit_number && `Unit ${site.unit_number}`, site.screen_count != null && `${site.screen_count} screen${site.screen_count === 1 ? '' : 's'}`]
                        .filter(Boolean).join(' · ') || 'No cost centre or unit yet'}
                    </span>
                  </span>
                  {ramsMissing && <span className="client-badge intake-badge">RAMS needed</span>}
                  <span className="site-card-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
                </button>
                <div className="site-card-controls">
                  {readOnly ? (
                    <>
                      <span className={`status-pill status-${siteStatusTone(site.status)}`}>{siteStatusLabel(site.status)}</span>
                      <span className="site-card-date">{site.install_date ? `Install ${formatDate(site.install_date)}` : 'No install date'}</span>
                    </>
                  ) : (
                    <>
                      <select
                        aria-label={`Stage for ${site.site_name}`}
                        value={site.status}
                        disabled={busy}
                        onChange={(e) => patch(site, { status: e.target.value }, 'Site stage', `${site.site_name}: ${siteStatusLabel(site.status)} → ${siteStatusLabel(e.target.value)}`)}
                      >
                        {!SITE_STATUSES.some((s) => s.key === site.status) && <option value={site.status}>{site.status}</option>}
                        {SITE_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                      <input
                        type="date"
                        aria-label={`Install date for ${site.site_name}`}
                        title="Install date"
                        min="2000-01-01"
                        max="2100-12-31"
                        value={site.install_date || ''}
                        disabled={busy}
                        onChange={(e) => patch(site, { install_date: e.target.value || null }, 'Site install date', `${site.site_name}: ${e.target.value ? formatDate(e.target.value) : 'cleared'}`)}
                      />
                    </>
                  )}
                </div>
              </div>

              {open && editingId !== site.id && (
                <div className="site-card-body">
                  <div className="kv-grid">
                    <Detail label="Address">{site.address}</Detail>
                    <Detail label="Cost Centre">{site.cost_centre}</Detail>
                    <Detail label="Unit Number">{site.unit_number}</Detail>
                    <Detail label="Site Manager">
                      {[site.manager_name, site.manager_phone, site.manager_email].filter(Boolean).join('\n') || null}
                    </Detail>
                    <Detail label="Opening Hours">{site.opening_hours}</Detail>
                    <Detail label="Install Preferences">{site.install_preferences}</Detail>
                  </div>
                  <Detail label="Notes">{site.notes}</Detail>

                  {answers.length > 0 && (
                    <div className="client-panel-section">
                      <div className="k">Site access</div>
                      <dl className="intake-answer-list">
                        {answers.map((a) => (
                          <div key={a.key} className="intake-answer" style={a.depth ? { paddingLeft: 14 * a.depth } : undefined}>
                            <dt>{a.label}</dt><dd>{a.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  <div className="client-panel-section">
                    <div className="k">RAMS · {ramsLabel(site.rams_required)}</div>
                    {(site.rams_files || []).length > 0 && (
                      <div className="attachment-list" style={{ marginTop: 6 }}>
                        {site.rams_files.map((f) => (
                          <div className="attachment-row" key={f.path}>
                            {f.url ? <a className="attachment-name" href={f.url} target="_blank" rel="noreferrer">{f.name}</a> : <span className="attachment-name">{f.name}</span>}
                            <span className="attachment-size">{formatBytes(f.size)}</span>
                            {!readOnly && <button type="button" className="attachment-remove" onClick={() => removeRams(site, f)} disabled={busy}>Remove</button>}
                          </div>
                        ))}
                      </div>
                    )}
                    {!readOnly && (
                      <label className={`attachment-add${busy ? ' busy' : ''}`} style={{ marginTop: 8 }}>
                        <input type="file" multiple disabled={busy} onChange={(e) => { addRams(site, e.target.files); e.target.value = ''; }} />
                        <span>{busy ? 'Working…' : '+ Upload RAMS for this site'}</span>
                      </label>
                    )}
                  </div>

                  <div className="client-panel-section">
                    <div className="k">Surveys for this site</div>
                    {linked.length === 0 ? (
                      <p className="hint" style={{ margin: '4px 0 0' }}>
                        None yet. Link one from the survey&apos;s own page and choose this site.
                      </p>
                    ) : (
                      linked.map((s) => (
                        <a className="sub-row" key={s.id} href={`/dashboard/${s.id}`}>
                          <div>
                            <div className="site">{s.survey_kind === 'self' ? 'Self survey' : 'Survey'} — {s.site_location || site.site_name}</div>
                            <div className="meta">{s.survey_date ? formatDate(s.survey_date) : '—'}</div>
                          </div>
                        </a>
                      ))
                    )}
                  </div>

                  {!readOnly && (
                    <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
                      <button type="button" className="btn btn-ghost" onClick={() => startEdit(site)} disabled={busy}>Edit site details</button>
                      <button type="button" className="btn btn-danger" onClick={() => removeSite(site)} disabled={busy}>Remove site</button>
                    </div>
                  )}
                </div>
              )}

              {editingId === site.id && <div className="site-card-body">{editor(site.id)}</div>}
            </div>
          );
        })}
      </div>

      {editingId === 'new' && (
        <div className="site-card open" style={{ marginTop: 10 }}>
          <div className="site-card-body">
            <div className="k" style={{ marginBottom: 8 }}>New site</div>
            {editor('new')}
          </div>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {!readOnly && editingId === null && (
        <button type="button" className="btn-add" style={{ marginTop: 12 }} onClick={startAdd}>
          {sites.length === 0 ? '+ Add sites to this project' : '+ Add another site'}
        </button>
      )}
    </div>
  );
}
