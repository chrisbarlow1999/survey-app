// The engineering firms that attend site for Linney.
//
// Kept in JS rather than in a table or a database enum, the same way the
// project workflow and the mount types are: adding or retiring a firm is a
// one-line edit that needs no migration and no admin screen for a list that
// changes once a year.
//
// Records written before migration 035 have no company at all, and a firm
// removed from this list keeps showing on the records that already name it —
// the column stores the name, not a reference to this array.
export const ENGINEER_COMPANIES = ['SCCI', 'EIT', 'Internal', 'Index'];

// Picking this reveals a text box, and what gets saved is whatever is typed —
// the column always holds a real company name so the report can group on it
// without special-casing.
export const OTHER_COMPANY = 'Other';

export const COMPANY_OPTIONS = [...ENGINEER_COMPANIES, OTHER_COMPANY];

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

// Splits a stored value back into the pair the form needs, so editing a record
// that named a firm not on the list reopens with "Other" already filled in.
export function splitCompany(stored) {
  const value = (stored || '').trim();
  if (!value) return { choice: '', other: '' };
  if (ENGINEER_COMPANIES.includes(value)) return { choice: value, other: '' };
  return { choice: OTHER_COMPANY, other: value };
}

// What the report shows for a record nobody filled in.
export const NOT_RECORDED = 'Not recorded';
