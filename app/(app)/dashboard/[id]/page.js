import { createClient } from '../../../../lib/supabaseServer';
import { SCREEN_SIZES } from '../../../../lib/screenSizes';
import { BlueprintDiagram } from '../../../../components/BlueprintDiagram';
import { PhotoWithOverlay } from '../../../../components/PhotoWithOverlay';
import { DeleteSurveyButton } from '../../../../components/DeleteSurveyButton';
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

export default async function ReportPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: survey, error } = await supabase
    .from('surveys')
    .select('*, clients(name)')
    .eq('id', id)
    .single();

  if (error || !survey) {
    return (
      <main>
        <div className="empty-state">Survey not found, or you don't have access to view it.</div>
      </main>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const canEdit = myProfile?.role !== 'client_viewer';

  // Signed URLs for photos — the bucket is private, so each photo needs a short-lived link.
  const locationsWithUrls = await Promise.all(
    (survey.locations || []).map(async (loc) => {
      let photoUrl = null;
      if (loc.photo_path) {
        const { data } = await supabase.storage
          .from('survey-photos')
          .createSignedUrl(loc.photo_path, 60 * 60); // 1 hour
        photoUrl = data?.signedUrl || null;
      }
      const additionalPhotoUrls = (
        await Promise.all(
          (loc.additional_photos || []).map((path) =>
            supabase.storage.from('survey-photos').createSignedUrl(path, 60 * 60)
          )
        )
      ).map((r) => r.data?.signedUrl).filter(Boolean);
      return { ...loc, photoUrl, additionalPhotoUrls };
    })
  );

  const attachments = await Promise.all(
    (survey.attachments || []).map(async (a) => {
      const { data } = await supabase.storage.from('survey-photos').createSignedUrl(a.path, 60 * 60);
      return { ...a, url: data?.signedUrl || null };
    })
  );

  return (
    <main>
      <a className="back-link" href="/dashboard">&larr; Back to Dashboard</a>
      <div className="toolbar no-print">
        {canEdit && <a className="btn btn-ghost" href={`/dashboard/${survey.id}/edit`}>Edit Survey</a>}
        <ClientPrintButton />
        <PrintButton label="Internal PDF" />
        {canEdit && <ArchiveButton table="surveys" recordId={survey.id} archived={Boolean(survey.archived_at)} />}
        {canEdit && (
          <DeleteSurveyButton
            surveyId={survey.id}
            photoPaths={[
              ...(survey.locations || []).map((l) => l.photo_path).filter(Boolean),
              ...(survey.locations || []).flatMap((l) => l.additional_photos || []),
              ...(survey.attachments || []).map((a) => a.path).filter(Boolean),
            ]}
          />
        )}
      </div>

      {survey.archived_at && (
        <div className="archived-banner no-print">
          This survey is archived — it's hidden from the main list. Use Restore to bring it back.
        </div>
      )}

      <ReportCoverPage
        title="Site Survey Report"
        siteName={survey.site_location}
        clientName={survey.clients?.name}
        date={formatDate(survey.survey_date)}
        address={survey.address}
      />

      <div className="panel" style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 20 }}>{survey.site_location}{survey.clients?.name ? <span className="client-badge" style={{ marginLeft: 10, verticalAlign: 'middle' }}>{survey.clients.name}</span> : null}</h2>
        <div className="kv-grid" style={{ marginTop: 12 }}>
          <div className="kv"><div className="k">Engineer</div><div className="v">{survey.engineer_first} {survey.engineer_last}</div></div>
          <div className="kv internal-only"><div className="k">Phone</div><div className="v">{survey.phone}</div></div>
          <div className="kv"><div className="k">Survey Date</div><div className="v">{formatDate(survey.survey_date)}</div></div>
          <div className="kv"><div className="k">Site Contact</div><div className="v">{survey.site_contact || '—'}</div></div>
          <div className="kv"><div className="k">Address</div><div className="v">{survey.address || '—'}</div></div>
          <div className="kv internal-only"><div className="k">Engineer Days (est.)</div><div className="v">{survey.engineer_days || '—'}</div></div>
          <div className="kv internal-only"><div className="k">Engineers Required</div><div className="v">{survey.engineer_count || '—'}</div></div>
        </div>
        {survey.additional_info && (
          <div className="kv internal-only" style={{ borderColor: 'var(--accent-cyan)' }}>
            <div className="k">Additional Information</div>
            <div className="v">{survey.additional_info}</div>
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
        {canEdit && survey.edit_history && survey.edit_history.length > 0 && (
          <div className="edit-history no-print">
            <div className="k">Edit History</div>
            <ul>
              {[...survey.edit_history].reverse().map((e, i) => (
                <li key={i}>{e.name} — {formatDateTime(e.edited_at)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, margin: '20px 0 10px' }}>
        Screen Locations ({locationsWithUrls.length})
      </h2>
      {locationsWithUrls.map((loc, i) => {
        const sizeInfo = SCREEN_SIZES[loc.screen_size];
        const wmm = loc.screen_size === 'other' ? (Number(loc.custom_w) || null) : sizeInfo?.wmm;
        const hmm = loc.screen_size === 'other' ? (Number(loc.custom_h) || null) : sizeInfo?.hmm;
        return (
          <div className={`report-loc${i === 0 ? ' first-loc' : ''}`} key={i}>
            <div className="print-only print-header">
              <span>{survey.site_location}</span>
              <span>{formatDate(survey.survey_date)}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: 12 }}>
              Location #{i + 1}{sizeInfo ? ' — ' + sizeInfo.label : ''}
            </div>
            <div className="loc-body">
              <div>
                <div className="kv-grid">
                  <div className="kv"><div className="k">Orientation</div><div className="v">{loc.orientation}</div></div>
                  <div className="kv"><div className="k">Model</div><div className="v">{sizeInfo ? sizeInfo.model : '—'}</div></div>
                  <div className="kv"><div className="k">Mount Type</div><div className="v">{loc.mount_type === 'Other' ? (loc.mount_type_other || 'Other') : (loc.mount_type || '—')}</div></div>
                  <div className="kv"><div className="k">Power Available</div><div className="v">{pill(loc.power)}</div></div>
                  <div className="kv"><div className="k">Data / 4G Available</div><div className="v">{pill(loc.data_port)}</div></div>
                </div>
                <div className="kv"><div className="k">Measurements</div><div className="v">{loc.measurements || '—'}</div></div>
                {loc.notes && (
                  <div className="kv" style={{ borderColor: 'var(--accent-cyan)' }}>
                    <div className="k">Notes</div>
                    <div className="v">{loc.notes}</div>
                  </div>
                )}
                {loc.photoUrl && (
                  <PhotoWithOverlay photoSrc={loc.photoUrl} overlay={loc.screen_overlay} readOnly />
                )}
                {loc.additionalPhotoUrls && loc.additionalPhotoUrls.length > 0 && (
                  <>
                    <div className="k" style={{ marginTop: 14, marginBottom: 6 }}>Additional Photos</div>
                    <div className="additional-photos-grid">
                      {loc.additionalPhotoUrls.map((url, idx) => (
                        <a href={url} target="_blank" rel="noreferrer" key={idx} className="additional-photo-thumb static">
                          <img src={url} alt={`Additional photo ${idx + 1}`} />
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <BlueprintDiagram wmm={wmm} hmm={hmm} orientation={loc.orientation} />
            </div>
          </div>
        );
      })}
    </main>
  );
}
