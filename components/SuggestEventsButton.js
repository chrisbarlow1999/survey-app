'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Asks the model to go and look, then drops what it finds in as drafts.
//
// Deliberately not automatic and not on a schedule: each run costs money and
// searches the web, so it happens when someone asks for it. The result is a
// count, never a claim that the list is now complete — the model is told to
// return nothing for a venue it couldn't verify, so a quiet week and a failed
// search look the same from here and both need a human eye.
export function SuggestEventsButton({ from, to, venueCount }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/events/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'The draft run failed.');
        return;
      }
      setResult(body);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="suggest-bar">
      <div>
        <button className="btn btn-primary" type="button" disabled={busy || venueCount === 0} onClick={run}>
          {busy ? 'Searching…' : 'Draft events with AI'}
        </button>
        <span className="hint" style={{ marginLeft: 10 }}>
          {venueCount === 0
            ? 'Add some venues to the watch list first.'
            : `Searches the web for what's on at your ${venueCount} watched venue${venueCount === 1 ? '' : 's'}. Everything it finds arrives as a draft for you to check.`}
        </span>
      </div>

      {busy && (
        <p className="hint">This takes a minute or two — it searches each venue in turn.</p>
      )}

      {result && (
        <p className="hint">
          Found {result.returned} across {result.venues} venue{result.venues === 1 ? '' : 's'};
          added {result.inserted} draft{result.inserted === 1 ? '' : 's'}
          {result.skipped > 0 ? `, skipped ${result.skipped} already known or outside the range` : ''}.
          {result.inserted > 0 ? ' Check each one before acting on it.' : ''}
        </p>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
