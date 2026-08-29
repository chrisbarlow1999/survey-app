import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Mirrors app/api/notify-survey/route.js — see that file for the reasoning.
// Best-effort, silently no-ops if not configured or if anything fails.
export async function POST(request) {
  try {
    const { installationId } = await request.json();
    if (!installationId) {
      return NextResponse.json({ skipped: true, reason: 'Missing installationId' });
    }
    if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ skipped: true, reason: 'Email notifications not configured' });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: installation } = await supabaseAdmin
      .from('installations')
      .select('id, site_location, engineer_first, engineer_last, install_date, clients(name, notification_email)')
      .eq('id', installationId)
      .single();

    const toEmail = installation?.clients?.notification_email;
    if (!installation || !toEmail) {
      return NextResponse.json({ skipped: true, reason: 'No notification inbox set for this client' });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const reportLink = appUrl ? `${appUrl}/installations/${installation.id}` : null;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM_EMAIL || 'onboarding@resend.dev',
        to: toEmail,
        subject: `Install completed — ${installation.site_location}${installation.clients?.name ? ` (${installation.clients.name})` : ''}`,
        text: [
          `An installation has been marked complete${installation.clients?.name ? ` for ${installation.clients.name}` : ''}.`,
          '',
          `Site: ${installation.site_location}`,
          `Engineer: ${installation.engineer_first} ${installation.engineer_last}`,
          `Install Date: ${installation.install_date}`,
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
    console.error('notify-installation error', err);
    return NextResponse.json({ skipped: true, reason: 'Unexpected error' });
  }
}
