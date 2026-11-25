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
    { href: '/companies', label: 'Engineer Companies' },
  ],
};

const ADMIN_GROUP = {
  label: 'Admin',
  children: [
    { href: '/admin/clients', label: 'Clients' },
    { href: '/admin/accounts', label: 'Accounts' },
    { href: '/admin/activity', label: 'Activity' },
  ],
};

const HOME_ITEM = { href: '/home', label: 'Home' };

// The project work itself: the projects, and the quotes raised against them.
// Client viewers don't get this group at all — projects carry internal task
// assignments and commentary (see migration 018), and quotes carry our margin.
const PROJECTS_GROUP = {
  label: 'Projects',
  children: [
    { href: '/projects', label: 'Projects' },
    { href: '/cost-sheets', label: 'Cost Sheets' },
    // Also a tab on the project views (where it shares their filters); here
    // so whoever orders hardware can find it without going through Projects.
    { href: '/projects/screens', label: 'Screen Pipeline' },
  ],
};

// What goes on the screens.
const CONTENT_GROUP = {
  label: 'Content',
  children: [
    { href: '/events', label: 'Events' },
    { href: '/menus', label: 'Menus' },
  ],
};

// How the platform is set up: the reusable things the day-to-day work draws on.
// Templates and Request Links are open to every internal account (staff add
// their own templates, see migration 049, and copy links for their clients;
// only super admins open or close a form). Hardware is super admins only, so
// it's added per role.
function setupGroup(role) {
  const children = [
    { href: '/templates', label: 'Templates' },
    { href: '/admin/request-links', label: 'Request Links' },
  ];
  if (role === 'super_admin') children.push({ href: '/admin/hardware', label: 'Hardware' });
  return { label: 'Setup', children };
}

// Client viewers get the records only — they can't submit anything.
export function buildNav(role) {
  if (role === 'client_viewer') return [HOME_ITEM, SITE_VISITS_GROUP];
  const items = [HOME_ITEM, PROJECTS_GROUP, CONTENT_GROUP, FORMS_GROUP, SITE_VISITS_GROUP, setupGroup(role)];
  if (role === 'super_admin') items.push(ADMIN_GROUP);
  return items;
}

// What an anonymous engineer sees on the public forms, before AppShell's
// session check has had a chance to upgrade it.
export const PUBLIC_NAV = [FORMS_GROUP];
