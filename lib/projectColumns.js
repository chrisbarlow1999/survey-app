import { formatDate } from './formatDate';
import { statusLabel, statusTone, priorityLabel } from './projectStatus';
import { formatGBP } from './money';
import { projectClientLabel } from './sectors';
import { contentRequested } from './intakeQuestions';

// The columns a person can choose for Projects → Table (saved per account in
// user_preferences, migration 053). "Project" is always the first column and
// isn't listed here.
//
//   id      stored in the preference — never rename one, or saved choices lose it
//   label   the column heading
//   sort    key into ProjectTable's sortable columns, if it can be sorted
//   num     right-aligned, tabular figures
//   cell    (project, { today }) → what goes in the cell
//
// Anything a column reads must be in the table page's select.

const muted = (text = '—') => <span className="table-muted">{text}</span>;

function live(p) {
  return !['complete', 'cancelled'].includes(p.status);
}

export const PROJECT_COLUMNS = [
  { id: 'reference', label: 'Reference', cell: (p) => p.reference || muted() },
  { id: 'client', label: 'Client', cell: (p) => projectClientLabel(p) || muted() },
  { id: 'sector', label: 'Sector', cell: (p) => p.sector?.name || muted() },
  { id: 'site', label: 'Site(s)', cell: (p) => p.site_location || muted() },
  { id: 'address', label: 'Address', cell: (p) => p.address || muted() },
  {
    id: 'stage',
    label: 'Stage',
    cell: (p) => <span className={`status-pill status-${statusTone(p.status)}`}>{statusLabel(p.status)}</span>,
  },
  { id: 'priority', label: 'Priority', cell: (p) => priorityLabel(p.priority) },
  { id: 'owner', label: 'Owner', cell: (p) => p.owner?.full_name || p.owner?.email || muted('Unassigned') },
  { id: 'sites', label: 'Sites', num: true, cell: (p) => (p.siteCount > 0 ? p.siteCount : muted()) },
  // Blank, not 0, when unestimated — see lib/screenCount.js.
  { id: 'screens', label: 'Screens', sort: 'screens', num: true, cell: (p) => (p.screen_count == null ? muted() : p.screen_count) },
  // Blank, not £0, when unquoted — see lib/money.js.
  { id: 'value', label: 'Value', sort: 'value', num: true, cell: (p) => (p.value_gbp == null ? muted() : formatGBP(p.value_gbp)) },
  { id: 'budget', label: 'Client budget', cell: (p) => p.intake_answers?.budget || muted() },
  {
    id: 'install',
    label: 'Install',
    sort: 'install',
    late: (p, { today }) => live(p) && p.install_date && p.install_date < today,
    cell: (p) => (p.install_date ? formatDate(p.install_date) : muted()),
  },
  { id: 'installTeam', label: 'Install team', cell: (p) => p.install_company || muted() },
  {
    id: 'due',
    label: 'Due',
    sort: 'due',
    late: (p, { today }) => live(p) && p.due_date && p.due_date < today,
    cell: (p) => (p.due_date ? formatDate(p.due_date) : muted()),
  },
  {
    id: 'tasks',
    label: 'Tasks',
    num: true,
    cell: (p) => (p.taskTotal > 0
      ? <span className={p.taskDone === p.taskTotal ? 'table-done' : ''}>{p.taskDone}/{p.taskTotal}</span>
      : muted()),
  },
  { id: 'content', label: 'Content requested', cell: (p) => (contentRequested(p.intake_answers) ? 'Yes' : muted()) },
  {
    id: 'delivery',
    label: 'Delivery address',
    cell: (p) => (p.intake_answers?.delivery_different === 'Yes'
      ? (p.intake_answers.delivery_address || 'Different — not given')
      : muted('Same as install')),
  },
  { id: 'source', label: 'Source', cell: (p) => (p.source === 'intake' ? 'Client request' : 'Added by us') },
  { id: 'requestedBy', label: 'Requested by', cell: (p) => p.requested_by || muted() },
  { id: 'lastActivity', label: 'Last activity', cell: (p) => (p.last_activity_at ? formatDate(p.last_activity_at) : muted()) },
  { id: 'raised', label: 'Raised', sort: 'created', cell: (p) => formatDate(p.created_at) },
];

const BY_ID = new Map(PROJECT_COLUMNS.map((c) => [c.id, c]));

// What everyone sees until they choose otherwise — the table as it was.
export const DEFAULT_PROJECT_COLUMNS = ['client', 'stage', 'owner', 'screens', 'value', 'install', 'due', 'tasks', 'raised'];

// A saved choice, cleaned: unknown ids (a column since removed) dropped,
// duplicates removed, and the default if nothing usable is left.
export function resolveProjectColumns(saved) {
  const ids = Array.isArray(saved) ? saved.filter((id) => BY_ID.has(id)) : [];
  const unique = [...new Set(ids)];
  return unique.length ? unique : DEFAULT_PROJECT_COLUMNS;
}

export function projectColumn(id) {
  return BY_ID.get(id);
}
