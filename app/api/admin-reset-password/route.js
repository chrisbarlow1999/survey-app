import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../lib/supabaseServer';
import { generatePassword } from '../../../lib/generatePassword';

// Privileged: overwrites a real login account's password. Only ever callable
// by a logged-in super admin — verified below using the caller's own session,
// before any service-role (RLS-bypassing) operation runs. Mirrors
// admin-create-user's auth pattern.
export async function POST(request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }
    const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (callerProfile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can reset passwords.' }, { status: 403 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY — this is not configured yet.' }, { status: 500 });
    }

    const { userId, password: requestedPassword } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId.' }, { status: 400 });
    }
    if (requestedPassword && requestedPassword.trim().length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }

    const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const password = requestedPassword ? requestedPassword.trim() : generatePassword();

    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, { password });
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    const { data: targetProfile } = await admin.from('profiles').select('email, full_name').eq('id', userId).single();
    await admin.from('admin_actions').insert({
      actor_id: user.id,
      action: 'reset_password',
      target: targetProfile?.full_name || targetProfile?.email || userId,
    });

    return NextResponse.json({ ok: true, password });
  } catch (err) {
    console.error('admin-reset-password error', err);
    return NextResponse.json({ error: 'Something went wrong resetting the password.' }, { status: 500 });
  }
}
