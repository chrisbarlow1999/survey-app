import { createClient } from '../../../../lib/supabaseServer';
import { DeleteInstallationButton } from '../../../../components/DeleteInstallationButton';
import { PrintButton, ClientPrintButton } from '../../../../components/PrintButton';
import { ReportCoverPage } from '../../../../components/ReportCoverPage';
import { ArchiveButton } from '../../../../components/ArchiveButton';
import { formatBytes } from '../../../../lib/formatBytes';
import { formatDate, formatDateTime } from '../../../../lib/formatDate';
import { ProjectLinkPicker } from '../../../../components/ProjectLinkPicker';
import { installPhotoPaths } from '../../../../lib/installArea';

export const dynamic = 'force-dynamic';

function pill(val) {
  if (val === 'Yes') return <span className="status-pill status-yes">Yes</span>;
  if (val === 'No') return <span className="status-pill status-no">No</span>;
  return <span className="status-pill">—</span>;
}

export default async function InstallationReportPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: installation, error } = await supabase
    .from('installations')
    .select('*, clients(name)')
    .eq('id', id)
    .single();

  if (error || !installation) {
    return (
      <main>
        <div className="empty-state">Installation not found, or you don't have access to view it.</div>
      </main>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase.from('profiles').select('full_name, email, role').eq('id', user.id).single();
  const canEdit = myProfile?.role !== 'client_viewer';
  const actorName = myProfile?.full_name || myProfile?.email || 'Unknown user';

  // Only same-client projects are offered by the link picker below.
  const { data: linkableProjects } = canEdit && installation.client_id
    ? await supabase.from('projects').select('id, title, reference').eq('client_id', installation.client_id).is('archived_at', null).order('created_at', { ascending: false })
    : { data: [] };

  // Signed URLs for every proof photo, one per screen within each area.
  const areasWithUrls = await Promise.all(
    (installation.locations || []).map(async (area) => {
      const screens = await Promise.all(
        (area.screens || []).map(async (s) => {
          if (!s.photo_path) return { ...s, photoUrl: null };
          const { data } = await supabase.storage.from('survey-photos').createSignedUrl(s.photo_path, 60 * 60);
          return { ...s, photoUrl: data?.signedUrl || null };
        })
      );
      return { ...area, screens };
    })
  );

  const attachments = await Promise.all(
    (installation.attachments || []).map(async (a) => {
      const { data } = await supabase.storage.from('survey-photos').createSignedUrl(a.path, 60 * 60);
      return { ...a, url: data?.signedUrl || null };
    })
  );

  let signatureUrl = null;
  if (installation.signature_path) {
    const { data } = await supabase.storage.from('survey-photos').createSignedUrl(installation.signature_path, 60 * 60);
    signatureUrl = data?.signedUrl || null;
  }

  return (
    <main>
      <a className="back-link" href="/installations">&larr; Back to Installations</a>
      <div className="toolbar no-print">
        {canEdit && <a className="btn btn-ghost" href={`/installations/${installation.id}/edit`}>Edit</a>}
        <ClientPrintButton />
        <PrintButton label="Internal PDF" />
        {canEdit && <ArchiveButton table="installations" recordId={installation.id} archived={Boolean(installation.archived_at)} />}
        {canEdit && (
          <DeleteInstallationButton
            installationId={installation.id}
            photoPaths={[
              ...installPhotoPaths(installation.locations),
              ...(installation.signature_path ? [installation.signature_path] : []),
              ...(installation.attachments || []).map((a) => a.path).filter(Boolean),
            ]}
          />
        )}
      </div>

      {installation.archived_at && (
        <div className="archived-banner no-print">
          This install confirmation is archived — it's hidden from the main list. Use Restore to bring it back.
        </div>
      )}

      <ReportCoverPage
        title="Install Confirmation"
        siteName={installation.site_location}
        clientName={installation.clients?.name}
      />

      <div className="panel report-summary" style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 20 }}>{installation.site_location}{installation.clients?.name ? <span className="client-badge" style={{ marginLeft: 10, verticalAlign: 'middle' }}>{installation.clients.name}</span> : null}</h2>
        <div className="kv-grid" style={{ marginTop: 12 }}>
          <div className="kv internal-only"><div className="k">Engineer</div><div className="v">{installation.engineer_first} {installation.engineer_last}</div></div>
          <div className="kv internal-only"><div className="k">Phone</div><div className="v">{installation.phone}</div></div>
          <div className="kv"><div className="k">Install Date</div><div className="v">{formatDate(installation.install_date)}</div></div>
          <div className="kv"><div className="k">Site Contact</div><div className="v">{installation.site_contact || '—'}</div></div>
          <div className="kv"><div className="k">Address</div><div className="v">{installation.address || '—'}</div></div>
        </div>
        {installation.additional_info && (
          <div className="kv internal-only" style={{ borderColor: 'var(--accent-cyan)' }}>
            <div className="k">Additional Information</div>
            <div className="v">{installation.additional_info}</div>
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
        {(installation.signed_by || signatureUrl) && (
          <div className="kv" style={{ borderColor: 'var(--ok)' }}>
            <div className="k">Site Sign-Off</div>
            <div className="v">{installation.signed_by || 'Signed'}</div>
            {signatureUrl && <img src={signatureUrl} alt="Signature" className="signature-existing-img" />}
          </div>
        )}
        {canEdit && (
          <ProjectLinkPicker
            table="installations"
            recordId={installation.id}
            currentProjectId={installation.project_id}
            projects={linkableProjects || []}
            actorName={actorName}
            recordLabel={`Install — ${installation.site_location || "Untitled site"}`}
          />
        )}
        {canEdit && installation.edit_history && installation.edit_history.length > 0 && (
          <div className="edit-history no-print">
            <div className="k">Edit History</div>
            <ul>
              {[...installation.edit_history].reverse().map((e, i) => (
                <li key={i}>{e.name} — {formatDateTime(e.edited_at)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, margin: '20px 0 10px' }}>
        Installed Screens ({areasWithUrls.length} area{areasWithUrls.length !== 1 ? 's' : ''})
      </h2>
      {areasWithUrls.map((area, i) => (
        <div className="report-loc" key={i}>
          <div className="print-only print-header">
            <span>{installation.site_location}</span>
            <span>{formatDate(installation.install_date)}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: 12 }}>
            Area #{i + 1}{area.area_name ? ' — ' + area.area_name : ''}
            <span className="area-screen-count">{(area.screens || []).length} screen{(area.screens || []).length !== 1 ? 's' : ''}</span>
          </div>
          {(area.screens || []).map((screen, si) => (
            <div className="report-screen" key={si}>
              <div className="report-screen-num">Screen {si + 1}</div>
              <div className="kv-grid">
                <div className="kv"><div className="k">Installed</div><div className="v">{pill(screen.installed)}</div></div>
              </div>
              {screen.notes && (
                <div className="kv" style={{ borderColor: 'var(--accent-cyan)' }}>
                  <div className="k">Notes</div>
                  <div className="v">{screen.notes}</div>
                </div>
              )}
              {screen.photoUrl && (
                <img src={screen.photoUrl} alt={`Proof photo — area ${i + 1}, screen ${si + 1}`} className="install-proof-photo" />
              )}
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}
