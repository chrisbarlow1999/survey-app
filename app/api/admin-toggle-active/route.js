import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../lib/supabaseServer';

// Privileged: bans/unbans a real login account via Supabase Auth's own
// ban_duration (blocks sign-in entirely, not just app-level hiding). Only
// ever callable by a logged-in super admin — verified below using the
// caller's own session, before any service-role operation runs.
export async function POST(request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }
    const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (callerProfile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can deactivate accounts.' }, { status: 403 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY — this is not configured yet.' }, { status: 500 });
    }

    const { userId, active } = await request.json();
    if (!userId || typeof active !== 'boolean') {
      return NextResponse.json({ error: 'Missing userId or active.' }, { status: 400 });
    }
    if (userId === user.id) {
      return NextResponse.json({ error: "You can't deactivate your own account." }, { status: 400 });
    }

    const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: active ? 'none' : '87600h', // "none" unbans; ~10 years is Supabase's usual stand-in for permanent
    });
    if (banErr) {
      return NextResponse.json({ error: banErr.message }, { status: 400 });
    }

    const { error: profileErr } = await admin.from('profiles').update({ active }).eq('id', userId);
    if (profileErr) console.error('Failed to mirror active flag on profile', profileErr);

    const { data: targetProfile } = await admin.from('profiles').select('email, full_name').eq('id', userId).single();
    await admin.from('admin_actions').insert({
      actor_id: user.id,
      action: active ? 'reactivate_account' : 'deactivate_account',
      target: targetProfile?.full_name || targetProfile?.email || userId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('admin-toggle-active error', err);
    return NextResponse.json({ error: 'Something went wrong updating this account.' }, { status: 500 });
  }
}
