// The single definition of the sidebar. Previously this lived in three places
// (both layouts and AppShell's client-side upgrade) which had to be kept
// byte-identical by hand; plain data with no client-only imports means the
// server layouts and the client shell can all read the same source.

const FORMS_GROUP = {
  label: 'Forms',
  children: [
    { href: '/', label: 'New Survey' },
    { href: '/install', label: 'New Install' },
    { href: '/visit', label: 'New Visit' },
  ],
};

const SITE_VISITS_GROUP = {
  label: 'Site Visits',
  children: [
    { href: '/dashboard', label: 'Surveys' },
    { href: '/installations', label: 'Installations' },
    { href: '/visits', label: 'Engineer Visits' },
    { href: '/sites', label: 'Site History' },
  ],
};

const ADMIN_GROUP = {
  label: 'Admin',
  children: [
    { href: '/admin/clients', label: 'Clients' },
    { href: '/admin/request-links', label: 'Request Links' },
    { href: '/admin/accounts', label: 'Accounts' },
    { href: '/admin/activity', label: 'Activity' },
  ],
};

// Projects sits above the groups as the hub the rest hangs off. It has no
// children of its own, and client viewers don't get it at all — projects carry
// internal task assignments and commentary (see migration 018).
const PROJECTS_ITEM = { href: '/projects', label: 'Projects' };

// Client viewers get the records only — they can't submit anything.
export function buildNav(role) {
  if (role === 'client_viewer') return [SITE_VISITS_GROUP];
  const items = [PROJECTS_ITEM, FORMS_GROUP, SITE_VISITS_GROUP];
  if (role === 'super_admin') items.push(ADMIN_GROUP);
  return items;
}

// What an anonymous engineer sees on the public forms, before AppShell's
// session check has had a chance to upgrade it.
export const PUBLIC_NAV = [FORMS_GROUP];
