'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { LogoutButton } from './LogoutButton';

function isActive(pathname, href) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

function isGroupActive(pathname, group) {
  return group.children.some((c) => isActive(pathname, c.href));
}

const STAFF_NAV_ITEMS = [
  { href: '/', label: 'New Survey' },
  { href: '/install', label: 'New Install' },
  { href: '/dashboard', label: 'Surveys' },
  { href: '/installations', label: 'Installations' },
];
const CLIENT_VIEWER_NAV_ITEMS = [
  { href: '/dashboard', label: 'Surveys' },
  { href: '/installations', label: 'Installations' },
];
const ADMIN_NAV_GROUP = {
  label: 'Admin',
  children: [
    { href: '/admin/clients', label: 'Clients' },
    { href: '/admin/accounts', label: 'Accounts' },
    { href: '/admin/activity', label: 'Activity' },
  ],
};

function initialExpandedGroups(navItems, pathname) {
  const initial = new Set();
  navItems.forEach((item) => {
    if (item.children && isGroupActive(pathname, item)) initial.add(item.label);
  });
  return initial;
}

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
  const [expandedGroups, setExpandedGroups] = useState(() => initialExpandedGroups(navItems, pathname));

  useEffect(() => {
    if (!checkSession) return;
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session || cancelled) return;
      const { data: profile } = await supabase.from('profiles').select('role, full_name, email').eq('id', session.user.id).single();
      if (cancelled) return;
      const upgraded = profile?.role === 'super_admin'
        ? [...STAFF_NAV_ITEMS, ADMIN_NAV_GROUP]
        : profile?.role === 'client_viewer'
          ? CLIENT_VIEWER_NAV_ITEMS
          : STAFF_NAV_ITEMS;
      setSessionNav(upgraded);
      setAccountName(profile?.full_name || profile?.email || null);
    });
    return () => { cancelled = true; };
  }, [checkSession]);

  const items = sessionNav || navItems;
  const activeFooter = sessionNav ? <LogoutButton name={accountName} /> : footer;

  function toggleGroup(label) {
    setExpandedGroups((s) => {
      const next = new Set(s);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className="shell">
      <button className="sidebar-toggle no-print" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
        <span></span><span></span><span></span>
      </button>

      <aside className={`sidebar no-print${open ? ' open' : ''}`}>
        <a href="/" className="brand"><span className="mark"></span>Site Survey</a>
        <nav>
          {items.map((item) => {
            if (item.children) {
              const groupActive = isGroupActive(pathname, item);
              const expanded = expandedGroups.has(item.label);
              return (
                <div className="sidebar-group" key={item.label}>
                  <button
                    type="button"
                    className={`sidebar-group-toggle${groupActive ? ' active' : ''}`}
                    onClick={() => toggleGroup(item.label)}
                    aria-expanded={expanded}
                  >
                    {item.label}
                    <span className={`sidebar-group-chevron${expanded ? ' open' : ''}`}>&#9656;</span>
                  </button>
                  {expanded && (
                    <div className="sidebar-group-children">
                      {item.children.map((child) => (
                        <a
                          key={child.href}
                          href={child.href}
                          className={isActive(pathname, child.href) ? 'active' : ''}
                          onClick={() => setOpen(false)}
                        >
                          {child.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <a
                key={item.href}
                href={item.href}
                className={isActive(pathname, item.href) ? 'active' : ''}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
        {activeFooter && <div className="sidebar-footer">{activeFooter}</div>}
      </aside>

      {open && <div className="sidebar-backdrop no-print" onClick={() => setOpen(false)} />}

      <div className="shell-content">{children}</div>
    </div>
  );
}
