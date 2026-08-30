'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { LogoutButton } from './LogoutButton';

function isActive(pathname, href) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

const LOGGED_IN_NAV_ITEMS = [
  { href: '/', label: 'New Survey' },
  { href: '/install', label: 'New Install' },
  { href: '/dashboard', label: 'Surveys' },
  { href: '/installations', label: 'Installations' },
];
const ADMIN_NAV_ITEM = { href: '/admin', label: 'Admin' };

// checkSession: only set by the public layout. Public pages (/, /install) stay
// fully static server-side on purpose — no auth check there, so a logged-in
// admin visiting them would otherwise see the stripped-down public nav. This
// does a cheap client-side session check after the static page has already
// loaded, and swaps in the full nav if one's found. Costs nothing for the
// anonymous majority (no session → no swap, no extra network call).
export function AppShell({ navItems, footer, checkSession, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sessionNav, setSessionNav] = useState(null);
  const [accountName, setAccountName] = useState(null);

  useEffect(() => {
    if (!checkSession) return;
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session || cancelled) return;
      const { data: profile } = await supabase.from('profiles').select('role, full_name, email').eq('id', session.user.id).single();
      if (cancelled) return;
      setSessionNav(profile?.role === 'super_admin' ? [...LOGGED_IN_NAV_ITEMS, ADMIN_NAV_ITEM] : LOGGED_IN_NAV_ITEMS);
      setAccountName(profile?.full_name || profile?.email || null);
    });
    return () => { cancelled = true; };
  }, [checkSession]);

  const items = sessionNav || navItems;
  const activeFooter = sessionNav ? <LogoutButton name={accountName} /> : footer;

  return (
    <div className="shell">
      <button className="sidebar-toggle no-print" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
        <span></span><span></span><span></span>
      </button>

      <aside className={`sidebar no-print${open ? ' open' : ''}`}>
        <a href="/" className="brand"><span className="mark"></span>Site Survey</a>
        <nav>
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={isActive(pathname, item.href) ? 'active' : ''}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </nav>
        {activeFooter && <div className="sidebar-footer">{activeFooter}</div>}
      </aside>

      {open && <div className="sidebar-backdrop no-print" onClick={() => setOpen(false)} />}

      <div className="shell-content">{children}</div>
    </div>
  );
}
