import { createClient } from '../../lib/supabaseServer';
import { AppShell } from '../../components/AppShell';
import { LogoutButton } from '../../components/LogoutButton';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let isSuperAdmin = false;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    isSuperAdmin = profile?.role === 'super_admin';
  }

  const navItems = [
    { href: '/', label: 'New Survey' },
    { href: '/install', label: 'New Install' },
    { href: '/dashboard', label: 'Surveys' },
    { href: '/installations', label: 'Installations' },
  ];
  if (isSuperAdmin) {
    navItems.push({ href: '/admin', label: 'Admin' });
  }

  return (
    <AppShell navItems={navItems} footer={<LogoutButton />}>
      {children}
    </AppShell>
  );
}
