// The branching questions on the client request form, as data. The form, the
// project page and the client's tracking page all read this list, so a question
// added here appears in all three with no other change.
//
// A question can carry `followUps`: more questions shown only when its answer
// matches the key. Answers are stored flat in projects.intake_answers, keyed by
// each question's `key` — so a key, once used, should never be reused for a
// different question, or old answers will be shown against the new wording.
//
// Types: 'yesno' (Yes / No buttons), 'text' (one line), 'textarea'.

const SITE_ACCESS_QUESTIONS = [
  {
    key: 'induction_required',
    label: 'Do visitors need a site induction?',
    type: 'yesno',
  },
  {
    key: 'escort_required',
    label: 'Will our engineers need to be escorted on site?',
    type: 'yesno',
  },
  {
    key: 'clearance_required',
    label: 'Do you need ID or security clearance from us in advance?',
    hint: 'For example engineer names, vehicle registrations, or DBS checks.',
    type: 'yesno',
    followUps: {
      Yes: [
        {
          key: 'clearance_details',
          label: 'What do you need, and how far in advance?',
          type: 'textarea',
          placeholder: 'e.g. Names and vehicle regs 5 working days before the visit',
        },
      ],
    },
  },
  {
    key: 'access_hours',
    label: 'When can we access the site?',
    type: 'text',
    placeholder: 'e.g. Mon–Fri 06:00–09:00 only, before opening',
  },
  {
    key: 'parking',
    label: 'Parking and loading',
    type: 'text',
    placeholder: 'e.g. Loading bay at the rear, permit needed',
  },
  {
    key: 'access_contact',
    label: 'Who should our engineers ask for when they arrive?',
    type: 'text',
    placeholder: 'Name and phone number',
  },
];

export const INTAKE_QUESTIONS = [
  {
    key: 'site_secure',
    label: 'Is the site secure or restricted access?',
    hint: 'Anywhere you have to sign in, be escorted or be cleared in advance — for example airside at an airport, a hospital ward, or a secure office.',
    type: 'yesno',
    followUps: { Yes: SITE_ACCESS_QUESTIONS },
  },
];

// The questions currently on screen, given the answers so far, in order.
// Each comes with its nesting depth so the form can indent follow-ups.
export function visibleQuestions(questions, answers, depth = 0) {
  const out = [];
  for (const q of questions) {
    out.push({ question: q, depth });
    const next = q.followUps?.[answers[q.key]];
    if (next) out.push(...visibleQuestions(next, answers, depth + 1));
  }
  return out;
}

// Only the answers to questions still on screen. Someone who said Yes, filled
// in the follow-ups, then changed to No shouldn't have those follow-ups saved
// against the project as if they applied.
export function answersToStore(questions, answers) {
  const kept = {};
  for (const { question } of visibleQuestions(questions, answers)) {
    const v = answers[question.key];
    if (typeof v === 'string' && v.trim() !== '') kept[question.key] = v.trim().slice(0, 1000);
  }
  return kept;
}

// For display: label + answer pairs, in question order, skipping anything
// unanswered. Answers stored under keys no longer in the list are shown at the
// end under their raw key rather than silently dropped.
export function describeAnswers(answers, questions = INTAKE_QUESTIONS) {
  if (!answers || typeof answers !== 'object') return [];
  const rows = [];
  const seen = new Set();
  for (const { question, depth } of visibleQuestions(questions, answers)) {
    seen.add(question.key);
    const v = answers[question.key];
    if (v != null && v !== '') rows.push({ key: question.key, label: question.label, value: String(v), depth });
  }
  for (const [k, v] of Object.entries(answers)) {
    if (!seen.has(k) && v != null && v !== '') rows.push({ key: k, label: k, value: String(v), depth: 0 });
  }
  return rows;
}

export function ramsLabel(value) {
  if (value === true) return 'Required';
  if (value === false) return 'Not required';
  return 'Not specified';
}
