// Same reference data as the prototype — Samsung landscape dimensions from the site survey form.
export const SCREEN_SIZES = {
  '13': { label: '13"', wmm: 322, hmm: 194, model: 'QB13R' },
  '32': { label: '32"', wmm: 727, hmm: 422, model: 'QM32C' },
  '37_stretch': { label: '37" Stretch Screen', wmm: 923, hmm: 253, model: 'SH37C' },
  '43': { label: '43"', wmm: 970, hmm: 558, model: 'QM43C' },
  '50': { label: '50"', wmm: 1124, hmm: 645, model: 'QM50C' },
  '55': { label: '55"', wmm: 1238, hmm: 709, model: 'QM55C' },
  '65': { label: '65"', wmm: 1457, hmm: 832, model: 'QM65C' },
  '75': { label: '75"', wmm: null, hmm: null, model: 'Confirm on site' },
  other: { label: 'Custom LED Wall', wmm: null, hmm: null, model: 'Custom' },
};

export const MOUNT_TYPES = [
  'Tilt Bracket',
  'Slim Profile Mount',
  'Ceiling Mount',
  'Swing Arm',
  'Other',
];
