// Sectors within a client (migration 047): Compass → Eurest, Levy, Chartwells…
// A project's sector is optional, and only ever one of its own client's.

// The embed every project query adds to get the sector's name alongside the
// client's. Goes through projects.sector_id, the only link between the two.
export const SECTOR_EMBED = 'sector:client_sectors(id, name)';

// "Compass · Eurest", or just "Compass" when there's no sector.
export function clientLabel(clientName, sectorName) {
  if (!clientName) return sectorName || '';
  return sectorName ? `${clientName} · ${sectorName}` : clientName;
}

// Same, from a project row carrying the `clients` and `sector` embeds.
export function projectClientLabel(p) {
  return clientLabel(p?.clients?.name, p?.sector?.name);
}

// Sectors for the filter bar and pickers, each with its client's name, sorted
// client then sector. Errors before 047 is run — an empty list then, which
// hides every sector control rather than breaking the page.
export async function loadSectors(supabase) {
  const { data, error } = await supabase
    .from('client_sectors')
    .select('id, client_id, name, clients(name)');
  if (error || !data) return [];
  return data
    .map((s) => ({ id: s.id, client_id: s.client_id, name: s.name, client_name: s.clients?.name || '' }))
    .sort((a, b) => a.client_name.localeCompare(b.client_name) || a.name.localeCompare(b.name));
}

// Sectors grouped under their client, for an <optgroup> per client.
export function groupSectors(sectors) {
  const groups = [];
  for (const s of sectors || []) {
    let g = groups.find((x) => x.client_id === s.client_id);
    if (!g) {
      g = { client_id: s.client_id, client_name: s.client_name, sectors: [] };
      groups.push(g);
    }
    g.sectors.push(s);
  }
  return groups;
}
