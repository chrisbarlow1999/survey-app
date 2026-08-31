import { createClient } from '../../../../lib/supabaseServer';
import { DeleteInstallationButton } from '../../../../components/DeleteInstallationButton';
import { PrintButton, ClientPrintButton } from '../../../../components/PrintButton';
import { ReportCoverPage } from '../../../../components/ReportCoverPage';
import { ArchiveButton } from '../../../../components/ArchiveButton';
import { formatBytes } from '../../../../components/AttachmentPicker';
import { formatDate, formatDateTime } from '../../../../lib/formatDate';

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
  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const canEdit = myProfile?.role !== 'client_viewer';

  const locationsWithUrls = await Promise.all(
    (installation.locations || []).map(async (loc) => {
      let photoUrl = null;
      if (loc.photo_path) {
        const { data } = await supabase.storage.from('survey-photos').createSignedUrl(loc.photo_path, 60 * 60);
        photoUrl = data?.signedUrl || null;
      }
      return { ...loc, photoUrl };
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
              ...(installation.locations || []).map((l) => l.photo_path).filter(Boolean),
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
        date={formatDate(installation.install_date)}
        address={installation.address}
      />

      <div className="panel" style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 20 }}>{installation.site_location}{installation.clients?.name ? <span className="client-badge" style={{ marginLeft: 10, verticalAlign: 'middle' }}>{installation.clients.name}</span> : null}</h2>
        <div className="kv-grid" style={{ marginTop: 12 }}>
          <div className="kv"><div className="k">Engineer</div><div className="v">{installation.engineer_first} {installation.engineer_last}</div></div>
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
        Installed Screens ({locationsWithUrls.length})
      </h2>
      {locationsWithUrls.map((loc, i) => (
        <div className={`report-loc${i === 0 ? ' first-loc' : ''}`} key={i}>
          <div className="print-only print-header">
            <span>{installation.site_location}</span>
            <span>{formatDate(installation.install_date)}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: 12 }}>
            Screen #{i + 1}{loc.label ? ' — ' + loc.label : ''}
          </div>
          <div className="kv-grid">
            <div className="kv"><div className="k">Installed</div><div className="v">{pill(loc.installed)}</div></div>
          </div>
          {loc.notes && (
            <div className="kv" style={{ borderColor: 'var(--accent-cyan)' }}>
              <div className="k">Notes</div>
              <div className="v">{loc.notes}</div>
            </div>
          )}
          {loc.photoUrl && (
            <img src={loc.photoUrl} alt={`Proof photo — screen ${i + 1}`} className="install-proof-photo" />
          )}
        </div>
      ))}
    </main>
  );
}
