import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Serves one photo from a survey that's been sent for client approval.
//
// The bucket is private and the approver has no account, so they can't create a
// signed URL themselves. This route validates the token, checks the requested
// path actually belongs to that survey, and only then signs it — so holding a
// token gets you that survey's photos and nothing else in the bucket.
//
// Needs SUPABASE_SERVICE_ROLE_KEY. Without it there's no way to sign a URL for
// an anonymous viewer at all, so the route reports that plainly rather than
// failing in a way that looks like a broken image.
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
      { error: 'Photo sharing is not configured on this deployment.' },
      { status: 503 }
    );
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Same function the approval page uses, so the same rules apply: unknown
  // token, archived survey or one never sent for approval all return nothing.
  const { data, error } = await anon.rpc('get_survey_for_approval', { p_token: token });
  const survey = Array.isArray(data) ? data[0] : data;
  if (error || !survey) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // The path has to be one this survey actually references. Without this check
  // a token would be a key to the whole bucket.
  const allowed = new Set();
  (survey.locations || []).forEach((area) => {
    if (area.photo_path) allowed.add(area.photo_path);
    (area.additional_photos || []).forEach((p) => allowed.add(p));
  });
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
    return NextResponse.json({ error: 'Could not load photo' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
