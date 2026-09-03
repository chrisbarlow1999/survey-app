import { AppShell } from '../../components/AppShell';
import { PUBLIC_NAV } from '../../lib/nav';

export default function PublicLayout({ children }) {
  return (
    <AppShell navItems={PUBLIC_NAV} footer={<a href="/login" className="sidebar-footer-link">Login</a>} checkSession>
      {children}
    </AppShell>
  );
}
