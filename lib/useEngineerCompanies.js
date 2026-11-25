'use client';

import { useEffect, useState } from 'react';
import { createClient } from './supabaseClient';
import { DEFAULT_COMPANIES, loadEngineerCompanies } from './engineerCompanies';

// One fetch per page load, shared by every dropdown on the page. Starts on the
// built-in list so a form is never left without options while it loads.
let pending = null;

// Called by Setup → Engineer Companies after a change, so forms opened later in
// the same browser session pick it up without a full reload.
export function resetEngineerCompaniesCache() {
  pending = null;
}

export function useEngineerCompanies() {
  const [list, setList] = useState(DEFAULT_COMPANIES);
  useEffect(() => {
    let live = true;
    if (!pending) pending = loadEngineerCompanies(createClient());
    pending.then((result) => { if (live) setList(result); });
    return () => { live = false; };
  }, []);
  return list;
}
