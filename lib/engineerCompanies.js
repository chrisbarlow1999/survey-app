// The engineering firms that attend site for Linney.
//
// Managed under Setup → Engineer Companies (migration 050) and read through
// loadEngineerCompanies() / useEngineerCompanies(). ENGINEER_COMPANIES below is
// only the fallback for when that table can't be read (e.g. before 050 runs).
//
// Records store the firm's NAME, not a reference to the list, so a firm that's
// been retired — or a name typed under "Other" — still shows on the records
// that name it. Every dropdown therefore includes the record's current value
// even when it isn't an active firm, so editing an old record never blanks it.
export const ENGINEER_COMPANIES = ['SCCI', 'EIT', 'Internal', 'Index'];

// Picking this reveals a text box, and what gets saved is whatever is typed —
// the column always holds a real company name so the report can group on it
// without special-casing.
export const OTHER_COMPANY = 'Other';

// Kept for anything that still wants the static list with "Other" on the end.
export const COMPANY_OPTIONS = [...ENGINEER_COMPANIES, OTHER_COMPANY];

export const DEFAULT_COMPANIES = ENGINEER_COMPANIES.map((name, i) => ({
  id: null, name, active: true, position: (i + 1) * 10,
}));

// Never throws — a failed read falls back to the built-in list so the forms
// always render.
export async function loadEngineerCompanies(supabase) {
  try {
    const { data, error } = await supabase
      .from('engineer_companies')
      .select('id, name, active, position');
    if (error || !data || data.length === 0) return DEFAULT_COMPANIES;
    return [...data].sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name));
  } catch {
    return DEFAULT_COMPANIES;
  }
}

// Names of the firms currently offered, in order.
export function activeCompanyNames(list) {
  return (list || DEFAULT_COMPANIES).filter((c) => c.active).map((c) => c.name);
}

// Options for a firm dropdown: the active firms, then the current value if it
// isn't one of them (a retired firm, or a name typed under "Other"), then
// "Other" when the form allows typing one in.
export function companyOptions(list, current, { withOther = true } = {}) {
  const names = activeCompanyNames(list);
  const opts = names.map((n) => ({ value: n, label: n }));
  const cur = (current || '').trim();
  if (cur && cur !== OTHER_COMPANY && !names.includes(cur)) {
    const retired = (list || []).some((c) => c.name === cur && !c.active);
    opts.push({ value: cur, label: retired ? `${cur} (retired)` : cur });
  }
  if (withOther) opts.push({ value: OTHER_COMPANY, label: OTHER_COMPANY });
  return opts;
}

// Turns a form's (choice, typed) pair into the single value to store.
// Returns null when there's nothing usable, so the column stays honestly empty
// rather than holding the word "Other".
export function resolveCompany(choice, otherText) {
  if (choice === OTHER_COMPANY) {
    const typed = (otherText || '').trim();
    return typed ? typed.slice(0, 80) : null;
  }
  const picked = (choice || '').trim();
  return picked ? picked.slice(0, 80) : null;
}

// Splits a stored value into the pair an edit form starts from. The stored
// name is selected as-is — companyOptions() always offers it, even if it's no
// longer an active firm — so "Other" only appears when the person picks it.
export function splitCompany(stored) {
  const value = (stored || '').trim();
  return { choice: value, other: '' };
}

// What the report shows for a record nobody filled in.
export const NOT_RECORDED = 'Not recorded';
