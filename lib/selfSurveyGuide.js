// The guided self survey a client does from their tracking link, as data.
//
// EXAMPLE PHOTOS
// Each step shows an example. Until real photos are supplied it draws a
// simple illustration (components/SelfSurveyIllustration.js). To use a real
// photo, drop it in /public/self-survey/ and set `exampleImage` on the step,
// e.g. exampleImage: '/self-survey/wide-shot.jpg'. Nothing else changes.

export const WALL_TYPES = [
  { key: 'plasterboard', label: 'Plasterboard / stud wall', tip: 'Sounds hollow when you knock on it.' },
  { key: 'masonry', label: 'Brick or block', tip: 'Solid and dull when knocked. Often painted brick or plastered block.' },
  { key: 'concrete', label: 'Concrete', tip: 'Very hard and solid — common in car parks, stations and newer buildings.' },
  { key: 'glass', label: 'Glass or glazing', tip: 'A window, glass partition or shopfront.' },
  { key: 'tiled', label: 'Tiled', tip: 'Ceramic or stone tiles over another wall.' },
  { key: 'panelled', label: 'Panelling or cladding', tip: 'Wood, metal or composite panels.' },
  { key: 'not_sure', label: "Not sure", tip: "That's fine — the close-up photo will help us tell." },
];

export const POWER_DISTANCES = [
  { key: 'within_1m', label: 'Within 1 metre', available: 'Yes' },
  { key: '1_3m', label: '1 to 3 metres', available: 'Yes' },
  { key: '3_5m', label: '3 to 5 metres', available: 'No' },
  { key: 'over_5m', label: 'More than 5 metres', available: 'No' },
  { key: 'none', label: "Can't find one", available: 'No' },
];

export const DATA_OPTIONS = [
  { key: 'wired', label: 'Wired network point nearby', available: 'Yes' },
  { key: 'wifi', label: 'Reliable Wi-Fi we can use', available: 'Yes' },
  { key: 'mobile', label: 'Good 4G / 5G phone signal', available: 'Yes' },
  { key: 'none', label: 'None of these', available: 'No' },
  { key: 'not_sure', label: 'Not sure', available: '' },
];

export const OBSTRUCTIONS = [
  'Radiator or heater',
  'Pipes or cables on the wall',
  'Door or window swings nearby',
  'Existing signage or shelving',
  'Sprinkler or smoke detector above',
  'Uneven or curved wall',
  'Hard to reach (needs ladder or access equipment)',
];

// The steps for each screen location, in order. `check` returns an error
// string when the step can't be left yet, or '' when it's complete.
export const AREA_STEPS = [
  {
    key: 'name',
    title: 'Name this location',
    intro: 'Give the spot a name we can both refer to — where in the building the screen will go.',
    illustration: 'name',
    tips: ['Use a name your team would recognise, e.g. "Reception, behind the desk" or "Bar wall facing the entrance".'],
    check: (a) => (a.name.trim() ? '' : 'Please give this location a name.'),
  },
  {
    key: 'wide',
    title: 'Photograph the whole wall',
    intro: 'Stand back so we can see the whole wall where the screen will go, including the floor and ceiling.',
    illustration: 'wide',
    tips: [
      'Hold your phone landscape (sideways).',
      'Step back until the floor and ceiling are both in the picture.',
      'Turn on the lights; avoid shooting straight into a window.',
    ],
    photoKey: 'wide',
    photoLabel: 'Whole wall',
    check: (a) => (a.photos.wide ? '' : 'Please add a photo of the whole wall — it is the most useful thing we get.'),
  },
  {
    key: 'wall',
    title: 'What is the wall made of?',
    intro: 'Knock on the wall where the screen will hang and pick the closest match, then take a close-up of the surface.',
    illustration: 'wall',
    tips: [
      'A hollow sound usually means plasterboard; a dull, solid sound means brick, block or concrete.',
      'For the close-up, hold the phone about an arm\'s length from the wall.',
    ],
    photoKey: 'wall',
    photoLabel: 'Wall surface close-up',
    check: (a) => (a.wallType ? '' : 'Please choose the closest wall type — "Not sure" is fine.'),
  },
  {
    key: 'measure',
    title: 'Measure the space',
    intro: 'With a tape measure, measure the clear wall space the screen can use. Centimetres are easiest.',
    illustration: 'measure',
    tips: [
      'Width: from the nearest obstacle on the left to the nearest on the right.',
      'Height: from where the bottom of the screen could sit to the ceiling or obstacle above.',
      'Rough numbers are fine — we will confirm before installing.',
    ],
    check: (a) => (a.widthCm || a.heightCm ? '' : 'Please give at least the width or height of the space.'),
  },
  {
    key: 'power',
    title: 'Find the nearest power socket',
    intro: 'How far is the nearest plug socket from where the screen will go? Take a photo of it.',
    illustration: 'power',
    tips: [
      'Look low on the wall, behind furniture, and above ceiling height if there are fused spurs.',
      'If you have a choice, photograph the closest one with the wall around it so we can see where it is.',
    ],
    photoKey: 'power',
    photoLabel: 'Nearest power socket',
    check: (a) => (a.powerDistance ? '' : 'Please choose how far away the nearest socket is.'),
  },
  {
    key: 'data',
    title: 'Internet connection',
    intro: 'Screens need the internet to receive content. What is available at this spot?',
    illustration: 'data',
    tips: [
      'A network point looks like a wider phone socket, often labelled with a number.',
      'For phone signal, check the bars on your phone while standing at the spot.',
    ],
    photoKey: 'data',
    photoLabel: 'Network point',
    check: (a) => (a.data ? '' : 'Please choose an option — "Not sure" is fine.'),
  },
  {
    key: 'obstructions',
    title: 'Anything in the way?',
    intro: 'Tick anything near the spot that might get in the way of fitting or using the screen.',
    illustration: 'obstructions',
    tips: ['If something is in the way, a photo of it helps us plan around it.'],
    photoKey: 'obstruction',
    photoLabel: 'Obstruction',
    check: () => '',
  },
  {
    key: 'screens',
    title: 'The screens for this location',
    intro: 'How many screens should go here, and do you know what size you need?',
    illustration: 'screens',
    tips: ['If you\'re not sure of the size, leave it — we will recommend one from your measurements.'],
    check: (a) => (Number(a.screenCount) >= 1 && Number(a.screenCount) <= 50 ? '' : 'Please enter how many screens (1 to 50).'),
  },
];

export function freshSelfArea() {
  return {
    id: 'ssa_' + Math.random().toString(36).slice(2, 9),
    name: '',
    // Files and previews by photo key: wide, wall, power, data, obstruction.
    photos: {},
    previews: {},
    wallType: '',
    widthCm: '',
    heightCm: '',
    bottomCm: '',
    ceilingCm: '',
    powerDistance: '',
    data: '',
    obstructions: [],
    obstructionNotes: '',
    screenCount: '1',
    sizeKey: '',
    orientation: 'Landscape',
    notes: '',
  };
}

// For the draft: everything typed, nothing that can't be serialised.
export function selfAreaToDraft(area) {
  const { photos, previews, ...rest } = area;
  return rest;
}

export function selfAreaFromDraft(area) {
  return { ...freshSelfArea(), ...area, photos: {}, previews: {} };
}

function labelOf(list, key) {
  return list.find((x) => x.key === key)?.label || '';
}

function measurementText(a) {
  const parts = [];
  if (a.widthCm) parts.push(`${a.widthCm}cm wide`);
  if (a.heightCm) parts.push(`${a.heightCm}cm high`);
  const space = parts.length ? `Clear wall space ${parts.join(' × ')}` : '';
  const more = [
    a.bottomCm ? `bottom of screen at ${a.bottomCm}cm from floor` : '',
    a.ceilingCm ? `ceiling ${a.ceilingCm}cm` : '',
  ].filter(Boolean);
  return [space, ...more].filter(Boolean).join('; ') + (space || more.length ? ' (client measured)' : '');
}

// Turns a finished self-survey area into the stored area shape every survey
// uses (see lib/surveyArea.js → areaToStored), so the report, the approval page,
// quotes and the screens pipeline read it with no special case. The extra
// detail an engineer would have judged by eye goes in `self_survey`.
export function selfAreaToStored(a, paths) {
  const power = POWER_DISTANCES.find((p) => p.key === a.powerDistance);
  const data = DATA_OPTIONS.find((d) => d.key === a.data);
  const count = Math.max(1, Math.min(50, Number(a.screenCount) || 1));
  const screenNote = [
    power ? `Nearest socket: ${power.label.toLowerCase()}` : '',
    data ? `Connection: ${data.label}` : '',
  ].filter(Boolean).join('. ');

  const extraKeys = ['wall', 'power', 'data', 'obstruction'];
  const additional = extraKeys.map((k) => paths[k]).filter(Boolean);
  const photoLabels = {};
  for (const step of AREA_STEPS) {
    if (step.photoKey && paths[step.photoKey]) photoLabels[paths[step.photoKey]] = step.photoLabel;
  }

  return {
    area_name: a.name.trim(),
    photo_path: paths.wide || null,
    screen_overlays: [],
    screen_size: a.sizeKey || '',
    custom_w: null,
    custom_h: null,
    orientation: a.orientation || 'Landscape',
    mount_type: '',
    mount_type_other: null,
    measurements: measurementText(a),
    screens: Array.from({ length: count }, () => ({
      power: power?.available || '',
      data_port: data?.available || '',
      notes: screenNote,
    })),
    additional_photos: additional,
    self_survey: {
      wall_type: labelOf(WALL_TYPES, a.wallType),
      width_cm: a.widthCm || null,
      height_cm: a.heightCm || null,
      bottom_cm: a.bottomCm || null,
      ceiling_cm: a.ceilingCm || null,
      power_distance: power?.label || '',
      connection: data?.label || '',
      obstructions: a.obstructions,
      obstruction_notes: a.obstructionNotes.trim(),
      notes: a.notes.trim(),
      photo_labels: photoLabels,
    },
  };
}

// Rows for showing a stored self_survey block on the internal report.
export function describeSelfSurveyArea(ss) {
  if (!ss) return [];
  const rows = [
    ['Wall type', ss.wall_type],
    ['Clear width', ss.width_cm ? `${ss.width_cm}cm` : ''],
    ['Clear height', ss.height_cm ? `${ss.height_cm}cm` : ''],
    ['Bottom of screen from floor', ss.bottom_cm ? `${ss.bottom_cm}cm` : ''],
    ['Ceiling height', ss.ceiling_cm ? `${ss.ceiling_cm}cm` : ''],
    ['Nearest power socket', ss.power_distance],
    ['Internet connection', ss.connection],
    ['In the way', (ss.obstructions || []).join(', ')],
    ['About the obstructions', ss.obstruction_notes],
    ['Client notes', ss.notes],
  ];
  return rows.filter(([, v]) => v);
}
