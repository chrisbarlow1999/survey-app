import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../lib/supabaseServer';
import { generatePassword } from '../../../lib/generatePassword';

// Privileged: creates a real login account. Only ever callable by a logged-in
// super admin — verified below using the caller's own session, before any
// service-role (RLS-bypassing) operation runs.
export async function POST(request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }
    const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (callerProfile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can create accounts.' }, { status: 403 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY — account creation is not configured yet.' }, { status: 500 });
    }

    const { email, fullName, role, clientIds, password: requestedPassword } = await request.json();
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }
    if (!['user', 'super_admin', 'client_viewer'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }
    if (role === 'client_viewer' && (!Array.isArray(clientIds) || clientIds.length !== 1)) {
      return NextResponse.json({ error: 'A client viewer must be assigned exactly one client.' }, { status: 400 });
    }
    if (requestedPassword && requestedPassword.trim().length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }

    const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const password = requestedPassword ? requestedPassword.trim() : generatePassword();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: (fullName || '').trim() },
    });
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 400 });
    }

    const newUserId = created.user.id;

    if (role !== 'user') {
      const { error: roleErr } = await admin.from('profiles').update({ role }).eq('id', newUserId);
      if (roleErr) console.error('Failed to set role on new account', roleErr);
    }
    if (role !== 'super_admin' && Array.isArray(clientIds) && clientIds.length) {
      const rows = clientIds.map((clientId) => ({ profile_id: newUserId, client_id: clientId }));
      const { error: grantErr } = await admin.from('profile_clients').insert(rows);
      if (grantErr) console.error('Failed to grant client access on new account', grantErr);
    }

    await admin.from('admin_actions').insert({
      actor_id: user.id,
      action: 'create_account',
      target: email.trim(),
      details: { role },
    });

    return NextResponse.json({ ok: true, email: email.trim(), password });
  } catch (err) {
    console.error('admin-create-user error', err);
    return NextResponse.json({ error: 'Something went wrong creating the account.' }, { status: 500 });
  }
}
