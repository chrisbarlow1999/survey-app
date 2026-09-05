'use client';

import { useEffect, useRef } from 'react';

// Keeps a copy of a half-filled public form in the browser, so an engineer who
// loses signal, gets a phone call, or closes the tab by accident doesn't lose
// twenty minutes of typing.
//
// IMPORTANT LIMITATION: photos are NOT saved. A File object can't be
// serialised, and the blob: URLs behind the previews die with the page. Only
// the typed content survives a reload — every form that uses this must say so
// on the restore banner, or someone will trust it and lose their photos.
// (Storing the images themselves in IndexedDB would fix that, and is the
// obvious next step if drafts prove useful.)

const PREFIX = 'survey-app-draft:';
const VERSION = 1;
const DEBOUNCE_MS = 800;
// A draft older than this is more likely to be confusing than useful.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // A draft written by an older shape of the form can't be trusted to
    // restore cleanly, so it's dropped rather than half-applied.
    if (!parsed || parsed.v !== VERSION || !parsed.data) return null;
    if (!parsed.at || Date.now() - parsed.at > MAX_AGE_MS) {
      clearDraft(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Blocked storage — nothing to clear.
  }
}

/**
 * Writes `snapshot` under `key` whenever it changes, debounced.
 *
 * Nothing is written until the form actually differs from how it started, so
 * simply opening a form never leaves a draft that prompts you on the next
 * visit. Pass enabled=false once submitted to stop the final keystroke being
 * saved back after the draft is cleared.
 */
export function useDraftAutosave(key, snapshot, enabled = true) {
  const json = JSON.stringify(snapshot);
  const pristine = useRef(null);
  if (pristine.current === null) pristine.current = json;

  useEffect(() => {
    if (!enabled || json === pristine.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify({ v: VERSION, at: Date.now(), data: JSON.parse(json) }));
      } catch {
        // Quota or private mode. Losing the draft is bad but silent is right —
        // an alert mid-typing would be worse than the thing it warns about.
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [key, json, enabled]);
}
