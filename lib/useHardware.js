'use client';

import { useEffect, useState } from 'react';
import { createClient } from './supabaseClient';
import { DEFAULT_HARDWARE, loadHardware } from './hardware';

// One fetch per page load, shared by every area card on the form. Starts on the
// built-in list so the dropdowns are never empty while it loads.
let pending = null;

// Called by Admin → Hardware after a change, so forms opened later in the same
// browser session pick it up without a full reload.
export function resetHardwareCache() {
  pending = null;
}

export function useHardware() {
  const [hw, setHw] = useState(DEFAULT_HARDWARE);
  useEffect(() => {
    let live = true;
    if (!pending) pending = loadHardware(createClient());
    pending.then((result) => { if (live) setHw(result); });
    return () => { live = false; };
  }, []);
  return hw;
}
