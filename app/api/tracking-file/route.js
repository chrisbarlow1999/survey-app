import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Serves one file from a client's tracking page: their RAMS, or a file they
// attached to the original request.
//
// Same shape as /api/approval-photo. The bucket is private and the client has
// no account, so this validates the token through get_project_for_tracking()
// (migration 043), checks the path is one that function actually hands out,
// and only then signs it. The project's live `attachments` column is
// deliberately NOT allowed — PMs and templates add internal files there.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const path = searchParams.get('path');

  if (!token || !path) {
    return NextResponse.json({ error: 'Missing token or path' }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'File sharing is not configured on this deployment.' },
      { status: 503 }
    );
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: project, error } = await anon.rpc('get_project_for_tracking', { p_token: token });
  if (error || !project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const allowed = new Set();
  (project.rams_files || []).forEach((f) => f?.path && allowed.add(f.path));
  (project.submission?.attachments || []).forEach((f) => f?.path && allowed.add(f.path));
  // Per-site RAMS (migration 044).
  (project.sites || []).forEach((s) => (s.rams_files || []).forEach((f) => f?.path && allowed.add(f.path)));
  if (!allowed.has(path)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
  const { data: signed, error: signErr } = await service.storage
    .from('survey-photos')
    .createSignedUrl(path, 60 * 10);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not load file' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
