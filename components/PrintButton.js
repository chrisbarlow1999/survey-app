'use client';

import { useEffect } from 'react';

export function PrintButton({ label = 'Print / Save as PDF' }) {
  return (
    <button className="btn btn-ghost" onClick={() => window.print()}>
      {label}
    </button>
  );
}

// Same print dialog, but flags the document first so the print stylesheet can
// hide internal-only fields (resourcing estimates, engineer phone, internal
// notes). The class is removed once printing finishes so the on-screen view is
// never affected.
export function ClientPrintButton({ label = 'Client PDF' }) {
  useEffect(() => {
    // Safety net: if a print is cancelled in a way that skips onafterprint,
    // make sure the flag never sticks around.
    function cleanup() {
      document.documentElement.classList.remove('client-print');
    }
    window.addEventListener('afterprint', cleanup);
    return () => {
      window.removeEventListener('afterprint', cleanup);
      cleanup();
    };
  }, []);

  function handleClick() {
    document.documentElement.classList.add('client-print');
    // Let the class apply before the (synchronous) print dialog opens.
    requestAnimationFrame(() => {
      window.print();
      document.documentElement.classList.remove('client-print');
    });
  }

  return (
    <button className="btn btn-primary" onClick={handleClick}>
      {label}
    </button>
  );
}
