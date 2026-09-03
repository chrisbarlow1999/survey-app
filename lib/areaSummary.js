// A survey's `locations` column now holds areas, each containing one or more
// screens, so a bare "N locations" count under-reports the job. Lives apart
// from lib/surveyArea.js because that module pulls in a client component,
// and the list pages using this are server components.
export function areaCountLabel(areas) {
  const list = areas || [];
  const screens = list.reduce((n, a) => n + ((a.screens || []).length || 0), 0);
  const areaPart = `${list.length} area${list.length !== 1 ? 's' : ''}`;
  if (!screens) return areaPart;
  return `${areaPart} · ${screens} screen${screens !== 1 ? 's' : ''}`;
}

// Installs use the same area/screen shape, so the label reads the same way.
export const installCountLabel = areaCountLabel;
