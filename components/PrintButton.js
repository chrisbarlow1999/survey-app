'use client';

export function PrintButton() {
  return (
    <button className="btn btn-ghost" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
