'use client';

// A Yes / No choice as two buttons, using the existing .segmented style.
// Clicking the selected answer again clears it, so an accidental tap can be
// undone without a third "not sure" button.
export function YesNo({ value, onChange, options = ['Yes', 'No'], ariaLabel }) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={value === opt ? 'on' : ''}
          aria-pressed={value === opt}
          onClick={() => onChange(value === opt ? '' : opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
