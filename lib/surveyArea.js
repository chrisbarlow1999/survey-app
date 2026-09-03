import { nextOverlay } from '../components/PhotoWithOverlay';

// Shared by the public survey form and the edit form so the two can't drift.
// Screens and their photo markers are kept strictly 1:1 — screen N owns
// marker N — so the boxes drawn on the photo always match the screens listed.

export function freshScreen() {
  return { id: 'scr_' + Math.random().toString(36).slice(2, 9), power: '', dataPort: '', notes: '' };
}

export function freshArea() {
  return {
    id: 'area_' + Math.random().toString(36).slice(2, 9),
    areaName: '',
    photoFile: null,
    photoPreview: null,
    photoPath: null,
    screenOverlays: [],
    sizeKey: '',
    customW: '',
    customH: '',
    orientation: 'Landscape',
    mountType: '',
    mountTypeOther: '',
    measurements: '',
    screens: [freshScreen()],
    additionalPhotos: [],
  };
}

export function addScreenToArea(area) {
  return {
    ...area,
    screens: [...area.screens, freshScreen()],
    screenOverlays: [...area.screenOverlays, nextOverlay(area.screenOverlays)],
  };
}

export function removeScreenFromArea(area, screenId) {
  const idx = area.screens.findIndex((s) => s.id === screenId);
  if (idx === -1) return area;
  return {
    ...area,
    screens: area.screens.filter((s) => s.id !== screenId),
    screenOverlays: area.screenOverlays.filter((_, i) => i !== idx),
  };
}

// A photo added after the screens were set up needs markers created for the
// screens that already exist, otherwise there's nothing to drag.
export function ensureOverlaysForScreens(area) {
  if (area.screenOverlays.length >= area.screens.length) return area;
  const overlays = [...area.screenOverlays];
  while (overlays.length < area.screens.length) overlays.push(nextOverlay(overlays));
  return { ...area, screenOverlays: overlays };
}

// Rebuilds editable form state from a stored area row.
export function areaFromExisting(area, photoUrl, additionalPhotoUrls) {
  return {
    id: 'area_' + Math.random().toString(36).slice(2, 9),
    areaName: area.area_name || '',
    photoFile: null,
    photoPreview: photoUrl || null,
    photoPath: area.photo_path || null,
    screenOverlays: Array.isArray(area.screen_overlays) ? area.screen_overlays : [],
    sizeKey: area.screen_size || '',
    customW: area.custom_w != null ? String(area.custom_w) : '',
    customH: area.custom_h != null ? String(area.custom_h) : '',
    orientation: area.orientation || 'Landscape',
    mountType: area.mount_type || '',
    mountTypeOther: area.mount_type_other || '',
    measurements: area.measurements || '',
    screens: (area.screens || []).length
      ? area.screens.map((s) => ({
          id: 'scr_' + Math.random().toString(36).slice(2, 9),
          power: s.power || '',
          dataPort: s.data_port || '',
          notes: s.notes || '',
        }))
      : [freshScreen()],
    additionalPhotos: (additionalPhotoUrls || []).map((url, idx) => ({
      key: 'existing_' + idx,
      file: null,
      preview: url,
      existingPath: (area.additional_photos || [])[idx] || null,
    })),
  };
}

// The stored shape. Screen-level power/data/notes use snake_case to match the
// rest of the jsonb payloads.
export function areaToStored(area, photoPath, additionalPhotoPaths) {
  return {
    area_name: area.areaName,
    photo_path: photoPath,
    screen_overlays: photoPath ? area.screenOverlays : [],
    screen_size: area.sizeKey,
    custom_w: area.sizeKey === 'other' ? area.customW : null,
    custom_h: area.sizeKey === 'other' ? area.customH : null,
    orientation: area.orientation,
    mount_type: area.mountType,
    mount_type_other: area.mountType === 'Other' ? area.mountTypeOther : null,
    measurements: area.measurements,
    screens: area.screens.map((s) => ({ power: s.power, data_port: s.dataPort, notes: s.notes })),
    additional_photos: additionalPhotoPaths,
  };
}
