import { AppShell } from '../../components/AppShell';

const navItems = [
  { href: '/', label: 'New Survey' },
  { href: '/install', label: 'New Install' },
];

export default function PublicLayout({ children }) {
  return (
    <AppShell navItems={navItems} footer={<a href="/login" className="sidebar-footer-link">Login</a>} checkSession>
      {children}
    </AppShell>
  );
}
