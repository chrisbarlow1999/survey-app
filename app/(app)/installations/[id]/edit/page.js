import { createClient } from '../../../../../lib/supabaseServer';
import { EditInstallationForm } from '../../../../../components/EditInstallationForm';

export const dynamic = 'force-dynamic';

export default async function EditInstallationPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: installation, error } = await supabase
    .from('installations')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !installation) {
    return (
      <main>
        <div className="empty-state">Installation not found, or you don't have access to edit it.</div>
      </main>
    );
  }

  const { data: clients } = await supabase.from('clients').select('id, name').order('name', { ascending: true });

  const { data: { user } } = await supabase.auth.getUser();
  const { data: editorProfile } = await supabase.from('profiles').select('full_name, email, role').eq('id', user.id).single();
  const editorName = editorProfile?.full_name || editorProfile?.email || 'Unknown user';

  if (editorProfile?.role === 'client_viewer') {
    return (
      <main>
        <div className="empty-state">You don't have permission to edit this.</div>
      </main>
    );
  }

  // A parallel array of signed URLs per area, one per screen, so the edit form
  // can show the existing proof photos without knowing about storage.
  const areasWithUrls = await Promise.all(
    (installation.locations || []).map(async (area) => {
      const photoUrls = await Promise.all(
        (area.screens || []).map(async (s) => {
          if (!s.photo_path) return null;
          const { data } = await supabase.storage.from('survey-photos').createSignedUrl(s.photo_path, 60 * 60);
          return data?.signedUrl || null;
        })
      );
      return { ...area, photoUrls };
    })
  );

  let signatureUrl = null;
  if (installation.signature_path) {
    const { data } = await supabase.storage.from('survey-photos').createSignedUrl(installation.signature_path, 60 * 60);
    signatureUrl = data?.signedUrl || null;
  }

  return (
    <main>
      <a className="back-link" href={`/installations/${installation.id}`}>&larr; Back to Report</a>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: '14px 0' }}>Edit Install Confirmation</h2>
      <EditInstallationForm installation={installation} areasWithUrls={areasWithUrls} clients={clients || []} editorName={editorName} signatureUrl={signatureUrl} />
    </main>
  );
}
