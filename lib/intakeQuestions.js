// The branching questions on the client request form, as data. The form, the
// project page and the client's tracking page all read this list, so a question
// added here appears in all three with no other change.
//
// A question can carry `followUps`: more questions shown only when its answer
// matches the key. Answers are stored flat in projects.intake_answers, keyed by
// each question's `key` — so a key, once used, should never be reused for a
// different question, or old answers will be shown against the new wording.
//
// Types: 'yesno' (Yes / No buttons), 'text' (one line), 'textarea', 'date'.

import { formatDate } from './formatDate';

// About the request as a whole — asked once, whatever the number of sites.
// Stored in projects.intake_answers (migration 052). INTAKE_QUESTIONS below are
// per site and live in project_sites.access_answers.
export const REQUEST_QUESTIONS = [
  {
    key: 'budget',
    label: 'Do you have a budget in mind?',
    hint: 'Optional — it helps us suggest the right options.',
    type: 'text',
    placeholder: 'e.g. Around £5,000 for the whole job',
  },
  {
    key: 'delivery_different',
    label: 'Is the delivery address different from the install address?',
    hint: 'For example, if the equipment should go to a head office or warehouse first.',
    type: 'yesno',
    followUps: {
      Yes: [
        { key: 'delivery_address', label: 'Delivery address', type: 'textarea', placeholder: 'Full address, including postcode' },
        { key: 'delivery_contact', label: 'Who should the delivery be addressed to?', type: 'text', placeholder: 'Name' },
        { key: 'delivery_phone', label: 'Their phone number', type: 'text', placeholder: 'For the courier' },
      ],
    },
  },
  {
    key: 'content_required',
    label: 'Do you require new content?',
    hint: 'The designs that go on the screens — for example menus, promotions or branding.',
    type: 'yesno',
    followUps: {
      Yes: [
        { key: 'content_details', label: 'What content do you need?', type: 'textarea', placeholder: 'e.g. Breakfast and lunch menu boards, plus a seasonal promo' },
        { key: 'content_needed_by', label: 'When do you need it by?', type: 'date' },
      ],
    },
  },
];

// Every key the request-level questions can store, follow-ups included.
function allKeys(questions) {
  const out = new Set();
  for (const q of questions) {
    out.add(q.key);
    for (const list of Object.values(q.followUps || {})) for (const k of allKeys(list)) out.add(k);
  }
  return out;
}
const REQUEST_KEYS = allKeys(REQUEST_QUESTIONS);

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
export function describeAnswers(answers, questions = INTAKE_QUESTIONS, { includeUnknown = true } = {}) {
  if (!answers || typeof answers !== 'object') return [];
  const rows = [];
  const seen = new Set();
  for (const { question, depth } of visibleQuestions(questions, answers)) {
    seen.add(question.key);
    const v = answers[question.key];
    if (v != null && v !== '') {
      rows.push({
        key: question.key,
        label: question.label,
        value: question.type === 'date' ? formatDate(String(v)) : String(v),
        depth,
      });
    }
  }
  if (includeUnknown) {
    for (const [k, v] of Object.entries(answers)) {
      if (!seen.has(k) && v != null && v !== '') rows.push({ key: k, label: k, value: String(v), depth: 0 });
    }
  }
  return rows;
}

// A project's intake_answers can hold both kinds: the request-level questions
// above (budget, delivery, content — migration 052) and, on requests from
// before sites existed, the site-access questions. These split them so each
// is shown under the right heading.
export function describeRequestAnswers(answers) {
  return describeAnswers(answers, REQUEST_QUESTIONS, { includeUnknown: false });
}

export function describeAccessAnswers(answers) {
  if (!answers || typeof answers !== 'object') return [];
  const rest = Object.fromEntries(Object.entries(answers).filter(([k]) => !REQUEST_KEYS.has(k)));
  return describeAnswers(rest, INTAKE_QUESTIONS);
}

export function contentRequested(answers) {
  return answers?.content_required === 'Yes';
}

export function ramsLabel(value) {
  if (value === true) return 'Required';
  if (value === false) return 'Not required';
  return 'Not specified';
}
