'use client';

import { visibleQuestions } from '../lib/intakeQuestions';
import { YesNo } from './YesNo';

// Renders a branching question list (see lib/intakeQuestions.js). Follow-ups
// appear indented under the answer that opened them.
export function IntakeQuestionFields({ questions, answers, onChange }) {
  return (
    <div className="intake-questions">
      {visibleQuestions(questions, answers).map(({ question: q, depth }) => (
        <div
          key={q.key}
          className={`intake-question${depth > 0 ? ' intake-followup' : ''}`}
          style={depth > 1 ? { marginLeft: 18 * (depth - 1) } : undefined}
        >
          <label className="intake-question-label" htmlFor={q.type === 'yesno' ? undefined : `iq-${q.key}`}>
            {q.label}
          </label>
          {q.hint && <p className="hint intake-question-hint">{q.hint}</p>}
          {q.type === 'yesno' && (
            <YesNo value={answers[q.key] || ''} onChange={(v) => onChange(q.key, v)} ariaLabel={q.label} />
          )}
          {q.type === 'text' && (
            <input
              id={`iq-${q.key}`}
              type="text"
              maxLength={1000}
              value={answers[q.key] || ''}
              placeholder={q.placeholder}
              onChange={(e) => onChange(q.key, e.target.value)}
            />
          )}
          {q.type === 'date' && (
            <input
              id={`iq-${q.key}`}
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              value={answers[q.key] || ''}
              onChange={(e) => onChange(q.key, e.target.value)}
              style={{ maxWidth: 220 }}
            />
          )}
          {q.type === 'textarea' && (
            <textarea
              id={`iq-${q.key}`}
              maxLength={1000}
              value={answers[q.key] || ''}
              placeholder={q.placeholder}
              onChange={(e) => onChange(q.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
