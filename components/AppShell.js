'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';

function isActive(pathname, href) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function AppShell({ navItems, footer, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="shell">
      <button className="sidebar-toggle no-print" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
        <span></span><span></span><span></span>
      </button>

      <aside className={`sidebar no-print${open ? ' open' : ''}`}>
        <a href="/" className="brand"><span className="mark"></span>Site Survey</a>
        <nav>
          {navItems.map((item) => (
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
        {footer && <div className="sidebar-footer">{footer}</div>}
      </aside>

      {open && <div className="sidebar-backdrop no-print" onClick={() => setOpen(false)} />}

      <div className="shell-content">{children}</div>
    </div>
  );
}
