-- Run this once in Supabase → SQL Editor, in addition to the original schema.sql.
-- Adds the ability for a logged-in dashboard user to delete a survey and its photos.

create policy "Authenticated users can delete surveys"
  on surveys for delete
  using (auth.role() = 'authenticated');

create policy "Authenticated users can delete survey photos"
  on storage.objects for delete
  using (bucket_id = 'survey-photos' and auth.role() = 'authenticated');
