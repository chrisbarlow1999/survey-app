import { createClient } from '../../../../lib/supabaseServer';
import { DeleteVisitButton } from '../../../../components/DeleteVisitButton';
import { PrintButton, ClientPrintButton } from '../../../../components/PrintButton';
import { ReportCoverPage } from '../../../../components/ReportCoverPage';
import { ArchiveButton } from '../../../../components/ArchiveButton';
import { formatBytes } from '../../../../lib/formatBytes';
import { formatDate, formatDateTime } from '../../../../lib/formatDate';
import { ProjectLinkPicker } from '../../../../components/ProjectLinkPicker';

export const dynamic = 'force-dynamic';

function pill(val) {
  if (val === 'Yes') return <span className="status-pill status-yes">Yes</span>;
  if (val === 'No') return <span className="status-pill status-no">No</span>;
  return <span className="status-pill">—</span>;
}

export default async function VisitReportPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: visit, error } = await supabase
    .from('visits')
    .select('*, clients(name)')
    .eq('id', id)
    .single();

  if (error || !visit) {
    return (
      <main>
        <div className="empty-state">Visit not found, or you don't have access to view it.</div>
      </main>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase.from('profiles').select('full_name, email, role').eq('id', user.id).single();
  const canEdit = myProfile?.role !== 'client_viewer';
  const actorName = myProfile?.full_name || myProfile?.email || 'Unknown user';

  // Only same-client projects are offered by the link picker below.
  const { data: linkableProjects } = canEdit && visit.client_id
    ? await supabase.from('projects').select('id, title, reference').eq('client_id', visit.client_id).is('archived_at', null).order('created_at', { ascending: false })
    : { data: [] };

  async function signed(path) {
    if (!path) return null;
    const { data } = await supabase.storage.from('survey-photos').createSignedUrl(path, 60 * 60);
    return data?.signedUrl || null;
  }

  const issuesWithUrls = await Promise.all(
    (visit.issues || []).map(async (issue) => ({
      ...issue,
      problemUrl: await signed(issue.problem_photo_path),
      workingUrl: await signed(issue.working_photo_path),
    }))
  );

  const attachments = await Promise.all(
    (visit.attachments || []).map(async (a) => ({ ...a, url: await signed(a.path) }))
  );

  const signatureUrl = await signed(visit.signature_path);

  return (
    <main>
      <a className="back-link" href="/visits">&larr; Back to Engineer Visits</a>
      <div className="toolbar no-print">
        {canEdit && <a className="btn btn-ghost" href={`/visits/${visit.id}/edit`}>Edit</a>}
        <ClientPrintButton />
        <PrintButton label="Internal PDF" />
        {canEdit && <ArchiveButton table="visits" recordId={visit.id} archived={Boolean(visit.archived_at)} />}
        {canEdit && (
          <DeleteVisitButton
            visitId={visit.id}
            photoPaths={[
              ...(visit.issues || []).flatMap((i) => [i.problem_photo_path, i.working_photo_path]),
              ...(visit.signature_path ? [visit.signature_path] : []),
              ...(visit.attachments || []).map((a) => a.path),
            ].filter(Boolean)}
          />
        )}
      </div>

      {visit.archived_at && (
        <div className="archived-banner no-print">
          This engineer visit is archived — it's hidden from the main list. Use Restore to bring it back.
        </div>
      )}

      <ReportCoverPage
        title="Engineer Visit"
        siteName={visit.site_location}
        clientName={visit.clients?.name}
      />

      <div className="panel report-summary" style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 20 }}>{visit.site_location}{visit.clients?.name ? <span className="client-badge" style={{ marginLeft: 10, verticalAlign: 'middle' }}>{visit.clients.name}</span> : null}</h2>
        <div className="kv-grid" style={{ marginTop: 12 }}>
          <div className="kv internal-only"><div className="k">Engineer</div><div className="v">{visit.engineer_first} {visit.engineer_last}</div></div>
          <div className="kv internal-only"><div className="k">Phone</div><div className="v">{visit.phone}</div></div>
          <div className="kv"><div className="k">Visit Date</div><div className="v">{formatDate(visit.visit_date)}</div></div>
          <div className="kv"><div className="k">Site Contact</div><div className="v">{visit.site_contact || '—'}</div></div>
          <div className="kv"><div className="k">Address</div><div className="v">{visit.address || '—'}</div></div>
        </div>
        {visit.additional_info && (
          <div className="kv internal-only" style={{ borderColor: 'var(--accent-cyan)' }}>
            <div className="k">Additional Information</div>
            <div className="v">{visit.additional_info}</div>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="kv" style={{ borderColor: 'var(--accent-cyan)' }}>
            <div className="k">Attachments</div>
            <div className="attachment-list" style={{ marginTop: 6 }}>
              {attachments.map((a, i) => (
                <div className="attachment-row" key={i}>
                  {a.url ? (
                    <a className="attachment-name" href={a.url} target="_blank" rel="noreferrer">{a.name}</a>
                  ) : (
                    <span className="attachment-name">{a.name}</span>
                  )}
                  <span className="attachment-size">{formatBytes(a.size)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {signatureUrl && (
          <div className="kv" style={{ borderColor: 'var(--ok)' }}>
            <div className="k">Engineer Signature</div>
            <div className="v internal-only">{visit.engineer_first} {visit.engineer_last}</div>
            <img src={signatureUrl} alt="Engineer signature" className="signature-existing-img" />
          </div>
        )}
        {canEdit && (
          <ProjectLinkPicker
            table="visits"
            recordId={visit.id}
            currentProjectId={visit.project_id}
            projects={linkableProjects || []}
            actorName={actorName}
            recordLabel={`Visit — ${visit.site_location || "Untitled site"}`}
          />
        )}
        {canEdit && visit.edit_history && visit.edit_history.length > 0 && (
          <div className="edit-history no-print">
            <div className="k">Edit History</div>
            <ul>
              {[...visit.edit_history].reverse().map((e, i) => (
                <li key={i}>{e.name} — {formatDateTime(e.edited_at)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, margin: '20px 0 10px' }}>
        Issues ({issuesWithUrls.length})
      </h2>
      {issuesWithUrls.map((issue, i) => (
        <div className="report-loc" key={i}>
          <div className="print-only print-header">
            <span>{visit.site_location}</span>
            <span>{formatDate(visit.visit_date)}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: 12 }}>
            Issue #{i + 1}{issue.title ? ' — ' + issue.title : ''}
          </div>
          <div className="kv-grid">
            <div className="kv"><div className="k">Resolved</div><div className="v">{pill(issue.resolved)}</div></div>
          </div>
          <div className="kv">
            <div className="k">What Was Done</div>
            <div className="v">{issue.fix || '—'}</div>
          </div>
          {(issue.problemUrl || issue.workingUrl) && (
            <div className="proof-photo-pair">
              {issue.problemUrl && (
                <div className="proof-photo-figure">
                  <div className="proof-photo-caption">The Problem</div>
                  <img src={issue.problemUrl} alt={`Problem — issue ${i + 1}`} className="proof-photo" />
                </div>
              )}
              {issue.workingUrl && (
                <div className="proof-photo-figure">
                  <div className="proof-photo-caption">Working After Fix</div>
                  <img src={issue.workingUrl} alt={`Working — issue ${i + 1}`} className="proof-photo" />
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </main>
  );
}
