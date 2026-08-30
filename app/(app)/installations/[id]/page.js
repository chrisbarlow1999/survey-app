import { createClient } from '../../../../lib/supabaseServer';
import { DeleteInstallationButton } from '../../../../components/DeleteInstallationButton';
import { PrintButton } from '../../../../components/PrintButton';

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
        <PrintButton />
        {canEdit && (
          <DeleteInstallationButton
            installationId={installation.id}
            photoPaths={[
              ...(installation.locations || []).map((l) => l.photo_path).filter(Boolean),
              ...(installation.signature_path ? [installation.signature_path] : []),
            ]}
          />
        )}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="print-only print-title">Install Confirmation</div>
        <h2 style={{ fontSize: 20 }}>{installation.site_location}{installation.clients?.name ? <span className="client-badge" style={{ marginLeft: 10, verticalAlign: 'middle' }}>{installation.clients.name}</span> : null}</h2>
        <div className="kv-grid" style={{ marginTop: 12 }}>
          <div className="kv"><div className="k">Engineer</div><div className="v">{installation.engineer_first} {installation.engineer_last}</div></div>
          <div className="kv"><div className="k">Phone</div><div className="v">{installation.phone}</div></div>
          <div className="kv"><div className="k">Install Date</div><div className="v">{installation.install_date}</div></div>
          <div className="kv"><div className="k">Site Contact</div><div className="v">{installation.site_contact || '—'}</div></div>
          <div className="kv"><div className="k">Address</div><div className="v">{installation.address || '—'}</div></div>
        </div>
        {installation.additional_info && (
          <div className="kv" style={{ borderColor: 'var(--accent-cyan)' }}>
            <div className="k">Additional Information</div>
            <div className="v">{installation.additional_info}</div>
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
                <li key={i}>{e.name} — {new Date(e.edited_at).toLocaleString()}</li>
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
            <span>{installation.install_date}</span>
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
