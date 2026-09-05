'use client';

import { useEffect, useId, useState } from 'react';
import { createClient } from '../lib/supabaseClient';

// Site name input with suggestions from the sites that client already has on
// record. Site History matches on this text, so a retyped name silently forks
// a site's history — the suggestions exist to stop that.
//
// A native <datalist> rather than a custom dropdown: it's still a free-text
// field (a genuinely new site must be typeable), it works with a phone keyboard
// without any focus handling of our own, and it needs no library.
export function SiteNameField({ value, onChange, clientId, label = 'Site Name', required = true }) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (!clientId) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    supabase
      .rpc('site_name_suggestions', { p_client_id: clientId })
      .then(({ data, error }) => {
        // Silent on failure — before migration 024 the function doesn't exist,
        // and a missing autocomplete shouldn't stop anyone filing a survey.
        if (cancelled || error || !data) return;
        setSuggestions(data.map((r) => r.site_location).filter(Boolean));
      });
    return () => { cancelled = true; };
  }, [clientId]);

  return (
    <>
      <label className={required ? 'req' : undefined}>{label}</label>
      <input
        type="text"
        list={suggestions.length ? listId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        placeholder={clientId ? undefined : 'Pick a client first to see existing sites'}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((name) => <option key={name} value={name} />)}
        </datalist>
      )}
    </>
  );
}
