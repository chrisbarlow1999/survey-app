import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Fires after a survey is submitted. Looks up the client's notification inbox
// and emails it via Resend. Deliberately best-effort — if anything here isn't
// configured yet, or fails, it no-ops rather than affecting the submission
// (which has already succeeded by the time this is called).
export async function POST(request) {
  try {
    const { surveyId } = await request.json();
    if (!surveyId) {
      return NextResponse.json({ skipped: true, reason: 'Missing surveyId' });
    }
    if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ skipped: true, reason: 'Email notifications not configured' });
    }

    // Service role key bypasses RLS — safe here because this route never
    // accepts anything from the client except the survey id, and it only runs
    // server-side. Never expose this key with a NEXT_PUBLIC_ prefix.
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: survey } = await supabaseAdmin
      .from('surveys')
      .select('id, site_location, engineer_first, engineer_last, survey_date, clients(name, notification_email)')
      .eq('id', surveyId)
      .single();

    const toEmail = survey?.clients?.notification_email;
    if (!survey || !toEmail) {
      return NextResponse.json({ skipped: true, reason: 'No notification inbox set for this client' });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const reportLink = appUrl ? `${appUrl}/dashboard/${survey.id}` : null;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM_EMAIL || 'onboarding@resend.dev',
        to: toEmail,
        subject: `New site survey — ${survey.site_location}${survey.clients?.name ? ` (${survey.clients.name})` : ''}`,
        text: [
          `A new site survey has been submitted${survey.clients?.name ? ` for ${survey.clients.name}` : ''}.`,
          '',
          `Site: ${survey.site_location}`,
          `Engineer: ${survey.engineer_first} ${survey.engineer_last}`,
          `Survey Date: ${survey.survey_date}`,
          reportLink ? `\nView it: ${reportLink}` : '',
        ].join('\n'),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('Resend notify failed', res.status, body);
      return NextResponse.json({ skipped: true, reason: 'Email provider rejected the request' });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('notify-survey error', err);
    return NextResponse.json({ skipped: true, reason: 'Unexpected error' });
  }
}
