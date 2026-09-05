'use client';

import { formatDateTime } from '../lib/formatDate';

// Offered at the top of a public form when an unfinished one is found in the
// browser. The photo warning is not optional decoration — drafts genuinely
// can't hold images, and someone who restores one and doesn't re-attach their
// photos has submitted a useless survey.
export function DraftBanner({ savedAt, onRestore, onDiscard, hadPhotos }) {
  return (
    <div className="draft-banner">
      <div className="draft-banner-text">
        <strong>You have an unfinished form from {formatDateTime(savedAt)}.</strong>
        <span>
          {hadPhotos
            ? ' Restoring brings back everything you typed, but not your photos — those will need adding again.'
            : ' Restoring brings back everything you typed. Photos are never saved in a draft.'}
        </span>
      </div>
      <div className="draft-banner-actions">
        <button type="button" className="btn btn-primary" onClick={onRestore}>Restore</button>
        <button type="button" className="btn btn-ghost" onClick={onDiscard}>Start fresh</button>
      </div>
    </div>
  );
}
