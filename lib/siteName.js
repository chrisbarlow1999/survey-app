// Groups by site NAME only — a plain text match, not a database relationship.
// Deliberately loose (trim + lowercase + collapse whitespace) so "Barlow Manor"
// and "barlow manor " land in the same group despite typos in casing/spacing,
// while genuinely different names (e.g. "Barlow Manor 2") stay separate.
export function normalizeSiteName(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
