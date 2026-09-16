// Where a cost sheet has got to. Deliberately the same four states as a survey
// approval, so the two read identically on screen and the Home approvals panel
// can show both without translating.
//
// One definition because three places label these: the cost sheet list, the
// survey report that spawned the sheet, and the sheet itself.
export const COST_SHEET_STATUS = {
  not_sent: { label: 'Draft', tone: 'open' },
  awaiting: { label: 'Awaiting client', tone: 'active' },
  approved: { label: 'Approved', tone: 'done' },
  changes_requested: { label: 'Changes requested', tone: 'warn' },
};

export function costSheetLabel(key) {
  return COST_SHEET_STATUS[key]?.label || key || '—';
}

export function costSheetTone(key) {
  return COST_SHEET_STATUS[key]?.tone || 'open';
}
