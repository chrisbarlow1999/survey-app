'use client';

import { use, useEffect, useState } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { formatDate, formatDateTime } from '../../../../lib/formatDate';
import { formatBytes } from '../../../../lib/formatBytes';
import { describeAnswers, ramsLabel } from '../../../../lib/intakeQuestions';
import { CLIENT_STAGES, clientStage, trackingPath } from '../../../../lib/clientTracking';
import { CopyLinkField } from '../../../../components/CopyLinkField';

function fileUrl(token, path) {
  return `/api/tracking-file?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`;
}

function timeRange(start, end) {
  const s = (start || '').slice(0, 5);
  const e = (end || '').slice(0, 5);
  if (s && e) return `${s}–${e}`;
  if (s) return `from ${s}`;
  return '';
}

const APPROVAL_LABELS = {
  awaiting: 'Waiting for your approval',
  approved: 'Approved',
  changes_requested: 'Changes requested',
};

// The client's own view of a project. No account — whoever holds the link sees
// this one project. Everything comes from get_project_for_tracking()
// (migration 043), which never selects notes, activity, owner, value, or tasks
// that haven't been ticked "show to client".
export default function TrackingPage({ params }) {
  const { token } = use(params);
  const supabase = createClient();
  const [project, setProject] = useState(null);
  const [lookupDone, setLookupDone] = useState(false);

  useEffect(() => {
    supabase.rpc('get_project_for_tracking', { p_token: token }).then(({ data }) => {
      setProject(data || null);
      setLookupDone(true);
    });
  }, [token]);

  if (!lookupDone) {
    return <main><div className="panel"><p className="hint">Loading…</p></div></main>;
  }

  // Unknown, archived and malformed tokens all look the same.
  if (!project) {
    return (
      <main>
        <div className="panel">
          <h2>This link isn&apos;t active</h2>
          <p className="hint">
            It may have been withdrawn or mistyped. Please get in touch with your Linney contact for an
            up-to-date link.
          </p>
        </div>
      </main>
    );
  }

  const stage = clientStage(project.status);
  const tasks = project.tasks || [];
  const doneTasks = tasks.filter((t) => t.completed_at).length;
  const pct = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : null;
  const submission = project.submission || null;
  const answers = describeAnswers(project.intake_answers);
  const ramsFiles = project.rams_files || [];
  const awaitingSurveys = (project.survey_approvals || []);
  const quotes = (project.quote_approvals || []);
  const selfSurveys = project.self_surveys || [];
  const actionCount =
    awaitingSurveys.filter((s) => s.approval_status === 'awaiting').length
    + quotes.filter((q) => q.approval_status === 'awaiting').length
    + (project.self_survey_eligible && selfSurveys.length === 0 ? 1 : 0);
  const installTime = timeRange(project.install_start_time, project.install_end_time);

  return (
    <main className="tracking-main">
      <div className="panel">
        <div className="tracking-eyebrow">
          {project.client_name}{project.reference ? ` · Ref ${project.reference}` : ''}
        </div>
        <h2 style={{ fontSize: 22, marginBottom: 4 }}>{project.title}</h2>
        {project.site_location && <p className="hint" style={{ marginTop: 0 }}>{project.site_location}</p>}

        {/* Where the job is. Off-path statuses (on hold, waiting on you,
            cancelled) are a note rather than a step, since they can happen at
            any point. */}
        <ol className="tracking-stages" aria-label="Progress">
          {CLIENT_STAGES.map((s, i) => {
            const state = stage.offPath ? 'todo' : i < stage.index ? 'done' : i === stage.index ? 'current' : 'todo';
            return (
              <li key={s.key} className={`tracking-stage ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                <span className="tracking-stage-dot">{state === 'done' ? '✓' : i + 1}</span>
                <span className="tracking-stage-label">{s.label}</span>
              </li>
            );
          })}
        </ol>
        <div className={`tracking-status${stage.offPath ? ' off-path' : ''}`}>
          <strong>{stage.label}.</strong> {stage.blurb}
        </div>

        <div className="kv-grid" style={{ marginTop: 16 }}>
          <div className="kv"><div className="k">Requested on</div><div className="v">{formatDate(submission?.submitted_at || project.created_at)}</div></div>
          <div className="kv"><div className="k">Needed by</div><div className="v">{project.due_date ? formatDate(project.due_date) : '—'}</div></div>
          <div className="kv">
            <div className="k">Installation</div>
            <div className="v">
              {project.install_date ? `${formatDate(project.install_date)}${installTime ? ` · ${installTime}` : ''}` : 'Not booked yet'}
            </div>
          </div>
          <div className="kv"><div className="k">Screens</div><div className="v">{project.screen_count ?? '—'}</div></div>
        </div>
      </div>

      {actionCount > 0 && (
        <div className="panel tracking-action-panel">
          <h2>Needs your attention <span className="panel-count">{actionCount}</span></h2>
          {project.self_survey_eligible && selfSurveys.length === 0 && (
            <div className="tracking-action">
              <div>
                <div className="tracking-action-title">Survey the site yourself</div>
                <div className="hint" style={{ margin: 0 }}>
                  Your date is close, so you can do the site survey yourself to save time. We&apos;ll guide you
                  through every photo and measurement.
                </div>
              </div>
              <a className="btn btn-primary" href={`/track/${token}/self-survey`}>Start self survey</a>
            </div>
          )}
          {awaitingSurveys.filter((s) => s.approval_status === 'awaiting').map((s) => (
            <div className="tracking-action" key={s.approval_token}>
              <div>
                <div className="tracking-action-title">Approve the survey for {s.site_location || 'your site'}</div>
                <div className="hint" style={{ margin: 0 }}>Check the proposed screen positions and let us know.</div>
              </div>
              <a className="btn btn-primary" href={`/approve/${s.approval_token}`}>Review survey</a>
            </div>
          ))}
          {quotes.filter((q) => q.approval_status === 'awaiting').map((q) => (
            <div className="tracking-action" key={q.approval_token}>
              <div>
                <div className="tracking-action-title">Approve your quote{q.reference ? ` (${q.reference})` : ''}</div>
                <div className="hint" style={{ margin: 0 }}>{q.title || 'Review the quote and approve it or ask for changes.'}</div>
              </div>
              <a className="btn btn-primary" href={`/quote/${q.approval_token}`}>Review quote</a>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <h2>
          Progress
          {pct !== null && <span className="area-screen-count">{doneTasks} of {tasks.length} done</span>}
        </h2>
        {pct !== null && (
          <div className="tracking-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tasks complete">
            <div className="tracking-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
        {tasks.length === 0 && (
          <div className="empty-state">We&apos;ll list the steps for this job here as we plan it.</div>
        )}
        {tasks.length > 0 && (
          <ul className="tracking-tasks">
            {tasks.map((t, i) => {
              const overdue = !t.completed_at && t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
              return (
                <li key={i} className={t.completed_at ? 'done' : ''}>
                  <span className="tracking-task-check" aria-hidden="true">{t.completed_at ? '✓' : ''}</span>
                  <span className="tracking-task-title">
                    {t.title}
                    <span className="visually-hidden">{t.completed_at ? ' (done)' : ' (to do)'}</span>
                  </span>
                  <span className={`tracking-task-meta${overdue ? ' task-overdue' : ''}`}>
                    {t.completed_at ? `Done ${formatDate(t.completed_at)}` : t.due_date ? `Due ${formatDate(t.due_date)}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {(awaitingSurveys.some((s) => s.approval_status !== 'awaiting') || quotes.some((q) => q.approval_status !== 'awaiting') || selfSurveys.length > 0) && (
        <div className="panel">
          <h2>Surveys &amp; quotes</h2>
          {selfSurveys.map((s, i) => (
            <div className="sub-row static" key={`self-${i}`}>
              <div>
                <div className="site">Your self survey{s.site_location ? ` — ${s.site_location}` : ''}</div>
                <div className="meta">Received {formatDateTime(s.submitted_at)}</div>
              </div>
              <div className="count"><span className="status-pill status-done">Received</span></div>
            </div>
          ))}
          {awaitingSurveys.filter((s) => s.approval_status !== 'awaiting').map((s) => (
            <a className="sub-row" key={s.approval_token} href={`/approve/${s.approval_token}`}>
              <div>
                <div className="site">Site survey — {s.site_location || 'your site'}</div>
                <div className="meta">{s.survey_date ? formatDate(s.survey_date) : ''}</div>
              </div>
              <div className="count"><span className="status-pill">{APPROVAL_LABELS[s.approval_status] || s.approval_status}</span></div>
            </a>
          ))}
          {quotes.filter((q) => q.approval_status !== 'awaiting').map((q) => (
            <a className="sub-row" key={q.approval_token} href={`/quote/${q.approval_token}`}>
              <div>
                <div className="site">Quote{q.reference ? ` ${q.reference}` : ''}</div>
                <div className="meta">{q.title || ''}</div>
              </div>
              <div className="count"><span className="status-pill">{APPROVAL_LABELS[q.approval_status] || q.approval_status}</span></div>
            </a>
          ))}
          {project.self_survey_eligible && selfSurveys.length > 0 && (
            <p className="hint" style={{ marginBottom: 0 }}>
              Need to add another area or correct something? <a href={`/track/${token}/self-survey`}>Send another self survey</a>.
            </p>
          )}
        </div>
      )}

      <div className="panel">
        <h2>RAMS <span className="area-screen-count">{ramsLabel(project.rams_required)}</span></h2>
        {ramsFiles.length > 0 ? (
          <div className="attachment-list">
            {ramsFiles.map((f) => (
              <div className="attachment-row" key={f.path}>
                <a className="attachment-name" href={fileUrl(token, f.path)} target="_blank" rel="noreferrer">{f.name}</a>
                {f.size ? <span className="attachment-size">{formatBytes(f.size)}</span> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            {project.rams_required === true
              ? "We're preparing your RAMS. They'll appear here to download as soon as they're ready."
              : 'No RAMS have been added for this job. If you need them, let your Linney contact know.'}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>What you sent us</h2>
        {submission?.backfilled && (
          <p className="hint">This request was raised before this page existed, so only the basic details are shown.</p>
        )}
        <div className="kv-grid">
          <div className="kv"><div className="k">Request</div><div className="v">{submission?.title || project.title}</div></div>
          <div className="kv"><div className="k">Site</div><div className="v">{(submission ? submission.site_location : project.site_location) || '—'}</div></div>
          <div className="kv"><div className="k">Address</div><div className="v">{(submission ? submission.address : project.address) || '—'}</div></div>
          {submission && (
            <div className="kv"><div className="k">Contact</div><div className="v">{[submission.requested_by, submission.requester_email].filter(Boolean).join(' · ') || '—'}</div></div>
          )}
        </div>
        {submission?.description && (
          <div className="kv" style={{ borderColor: 'var(--accent)', marginBottom: 14 }}>
            <div className="k">Details</div>
            <div className="v" style={{ whiteSpace: 'pre-wrap' }}>{submission.description}</div>
          </div>
        )}
        {answers.length > 0 && (
          <>
            <div className="k tracking-subhead">Site access</div>
            <dl className="intake-answer-list">
              {answers.map((a) => (
                <div key={a.key} className="intake-answer" style={a.depth ? { paddingLeft: 14 * a.depth } : undefined}>
                  <dt>{a.label}</dt>
                  <dd>{a.value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {(submission?.attachments || []).length > 0 && (
          <>
            <div className="k tracking-subhead">Your files</div>
            <div className="attachment-list">
              {submission.attachments.map((f) => (
                <div className="attachment-row" key={f.path}>
                  <a className="attachment-name" href={fileUrl(token, f.path)} target="_blank" rel="noreferrer">{f.name}</a>
                  {f.size ? <span className="attachment-size">{formatBytes(f.size)}</span> : null}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Keep this page</h2>
        <p className="hint">
          Bookmark this page or save the link below — it&apos;s the only way back here, and it updates as the job
          moves on. Anyone you share it with can see this page.
        </p>
        <CopyLinkField path={trackingPath(token)} />
      </div>
    </main>
  );
}
