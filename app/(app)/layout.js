import { createClient } from '../../lib/supabaseServer';
import { AppShell } from '../../components/AppShell';
import { LogoutButton } from '../../components/LogoutButton';
import { buildNav } from '../../lib/nav';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role = 'user';
  let accountName = null;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role, full_name, email').eq('id', user.id).single();
    role = profile?.role || 'user';
    accountName = profile?.full_name || profile?.email || null;
  }

  return (
    <AppShell navItems={buildNav(role)} footer={<LogoutButton name={accountName} />}>
      {children}
    </AppShell>
  );
}
