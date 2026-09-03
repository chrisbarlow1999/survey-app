import { createClient } from '../../../../../lib/supabaseServer';
import { EditVisitForm } from '../../../../../components/EditVisitForm';

export const dynamic = 'force-dynamic';

export default async function EditVisitPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: visit, error } = await supabase
    .from('visits')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !visit) {
    return (
      <main>
        <div className="empty-state">Visit not found, or you don't have access to edit it.</div>
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

  const signatureUrl = await signed(visit.signature_path);

  return (
    <main>
      <a className="back-link" href={`/visits/${visit.id}`}>&larr; Back to Report</a>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: '14px 0' }}>Edit Engineer Visit</h2>
      <EditVisitForm visit={visit} issuesWithUrls={issuesWithUrls} clients={clients || []} editorName={editorName} signatureUrl={signatureUrl} />
    </main>
  );
}
