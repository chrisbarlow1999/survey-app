export function computeStats(rows) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const total = rows.length;
  const thisMonth = rows.filter((r) => new Date(r.submitted_at) >= startOfMonth).length;

  const byClient = {};
  rows.forEach((r) => {
    const name = r.clients?.name || 'Unassigned';
    byClient[name] = (byClient[name] || 0) + 1;
  });
  const clientStats = Object.entries(byClient).sort((a, b) => b[1] - a[1]);

  return { total, thisMonth, clientStats };
}
