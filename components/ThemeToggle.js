'use client';

import { useEffect, useState } from 'react';

// Light / dark switch for the sidebar footer.
//
// With nothing stored the app follows the OS setting; clicking here writes an
// explicit choice to localStorage, which the inline script in app/layout.js
// reads before first paint. That script is what stops the page flashing light
// before flipping to dark on load — this component only handles the click.
export function ThemeToggle() {
  // Starts null so the first server render and the first client render agree.
  // The real value arrives in the effect below, after hydration.
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    const root = document.documentElement;
    const explicit = root.dataset.theme;
    if (explicit === 'dark' || explicit === 'light') {
      setTheme(explicit);
      return;
    }
    setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Private browsing or blocked storage: the theme still applies for this
      // page load, it just won't be remembered.
    }
    setTheme(next);
  }

  // Render nothing until the effect has run, rather than guessing and showing
  // the wrong label for a frame.
  if (!theme) return <div className="theme-toggle-placeholder" aria-hidden="true" />;

  const goingDark = theme === 'light';
  return (
    <button
      type="button"
      className="sidebar-footer-link theme-toggle"
      onClick={toggle}
      aria-label={goingDark ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        {goingDark ? (
          <path d="M17 11.2A7.2 7.2 0 0 1 8.8 3a7.2 7.2 0 1 0 8.2 8.2z" />
        ) : (
          <>
            <circle cx="10" cy="10" r="3.6" />
            <path d="M10 1.6v2M10 16.4v2M2.9 2.9l1.4 1.4M15.7 15.7l1.4 1.4M1.6 10h2M16.4 10h2M2.9 17.1l1.4-1.4M15.7 4.3l1.4-1.4" />
          </>
        )}
      </svg>
      {goingDark ? 'Dark mode' : 'Light mode'}
    </button>
  );
}
