import { createClient } from '../../lib/supabaseServer';
import { AppShell } from '../../components/AppShell';
import { LogoutButton } from '../../components/LogoutButton';

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

  let navItems;
  if (role === 'client_viewer') {
    navItems = [
      { href: '/dashboard', label: 'Surveys' },
      { href: '/installations', label: 'Installations' },
    ];
  } else {
    navItems = [
      { href: '/', label: 'New Survey' },
      { href: '/install', label: 'New Install' },
      { href: '/dashboard', label: 'Surveys' },
      { href: '/installations', label: 'Installations' },
    ];
    if (role === 'super_admin') {
      navItems.push({
        label: 'Admin',
        children: [
          { href: '/admin/clients', label: 'Clients' },
          { href: '/admin/accounts', label: 'Accounts' },
          { href: '/admin/activity', label: 'Activity' },
        ],
      });
    }
  }

  return (
    <AppShell navItems={navItems} footer={<LogoutButton name={accountName} />}>
      {children}
    </AppShell>
  );
}
