// Installs mirror the survey's area/screen split: an area is a place ("Bar
// wall"), and each screen inside it is signed off individually with its own
// proof photo. Shared by the public install form and the edit form.

export function freshInstallScreen() {
  return {
    id: 'scr_' + Math.random().toString(36).slice(2, 9),
    photoFile: null,
    photoPreview: null,
    photoPath: null,
    installed: '',
    notes: '',
  };
}

export function freshInstallArea() {
  return {
    id: 'area_' + Math.random().toString(36).slice(2, 9),
    areaName: '',
    screens: [freshInstallScreen()],
  };
}

export function addScreenToInstallArea(area) {
  return { ...area, screens: [...area.screens, freshInstallScreen()] };
}

export function removeScreenFromInstallArea(area, screenId) {
  return { ...area, screens: area.screens.filter((s) => s.id !== screenId) };
}

// Rebuilds editable state from a stored area. `photoUrls` is a parallel array
// of signed URLs, one per screen, resolved by the server component.
export function installAreaFromExisting(area, photoUrls) {
  const screens = area.screens || [];
  return {
    id: 'area_' + Math.random().toString(36).slice(2, 9),
    areaName: area.area_name || '',
    screens: screens.length
      ? screens.map((s, i) => ({
          id: 'scr_' + Math.random().toString(36).slice(2, 9),
          photoFile: null,
          photoPreview: (photoUrls || [])[i] || null,
          photoPath: s.photo_path || null,
          installed: s.installed || '',
          notes: s.notes || '',
        }))
      : [freshInstallScreen()],
  };
}

export function installAreaToStored(area, screenPhotoPaths) {
  return {
    area_name: area.areaName,
    screens: area.screens.map((s, i) => ({
      photo_path: screenPhotoPaths[i] || null,
      installed: s.installed,
      notes: s.notes,
    })),
  };
}

// Every proof photo across an install, for storage cleanup and the delete button.
export function installPhotoPaths(areas) {
  return (areas || []).flatMap((a) => (a.screens || []).map((s) => s.photo_path)).filter(Boolean);
}
