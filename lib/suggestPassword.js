// Browser-safe random password suggestion for admin forms — the actual value
// set on the account is whatever's in the field when submitted (typed or
// this suggestion), enforced server-side either way.
export function suggestPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}
