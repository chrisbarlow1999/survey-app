'use client';

import { useEffect, useState } from 'react';

// A read-only link with a Copy button. Takes a site-relative path and turns it
// into a full URL after mount — the browser's origin isn't known during server
// rendering, and building it there would make the two renders disagree.
// The input is selectable as a fallback for browsers that refuse clipboard
// access (non-HTTPS, some embedded views).
export function CopyLinkField({ path, label = 'Copy link' }) {
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    setUrl(`${base.replace(/\/$/, '')}${path}`);
  }, [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="copy-link-field">
      <input type="text" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link" />
      <button type="button" className="btn btn-ghost" onClick={copy}>
        {copied ? 'Copied' : label}
      </button>
    </div>
  );
}
