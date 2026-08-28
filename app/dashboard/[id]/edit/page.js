import { createClient } from '../../../../lib/supabaseServer';
import { EditSurveyForm } from '../../../../components/EditSurveyForm';

export const dynamic = 'force-dynamic';

export default async function EditSurveyPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: survey, error } = await supabase
    .from('surveys')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !survey) {
    return (
      <main>
        <div className="empty-state">Survey not found, or you don't have access to edit it.</div>
      </main>
    );
  }

  const { data: clients } = await supabase.from('clients').select('id, name').order('name', { ascending: true });

  const locationsWithUrls = await Promise.all(
    (survey.locations || []).map(async (loc) => {
      let photoUrl = null;
      if (loc.photo_path) {
        const { data } = await supabase.storage.from('survey-photos').createSignedUrl(loc.photo_path, 60 * 60);
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

  return (
    <main>
      <a className="back-link" href={`/dashboard/${survey.id}`}>&larr; Back to Report</a>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: '14px 0' }}>Edit Survey</h2>
      <EditSurveyForm survey={survey} locationsWithUrls={locationsWithUrls} clients={clients || []} />
    </main>
  );
}
