'use client';

import { useEffect, useState } from 'react';
import { CopyLinkField } from './CopyLinkField';

// "Send this to the site manager" for one self-survey link (migration 045).
// The link opens that site's survey and nothing else, so it's safe to forward
// — unlike the tracking link, which shows the whole project.
//
// Offers the link to copy, plus a ready-written email when we know the
// manager's address. mailto: opens the viewer's own mail app, so nothing is
// sent by us and nothing needs an email service.
export function SelfSurveyShare({ link, siteName, projectTitle, managerName, managerEmail, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [origin, setOrigin] = useState('');
  const path = `/self-survey/${link}`;

  useEffect(() => {
    setOrigin((process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, ''));
  }, []);

  const greeting = managerName ? `Hi ${managerName.split(' ')[0]},` : 'Hi,';
  const subject = `Quick site survey${siteName ? ` for ${siteName}` : ''}`;
  const body = [
    greeting,
    '',
    `We're having digital screens installed${siteName ? ` at ${siteName}` : ''}${projectTitle ? ` (${projectTitle})` : ''}. To get things moving, could you complete a short survey of the site on your phone?`,
    '',
    "It walks you through a few photos and measurements of where the screens will go — about 10–15 minutes per location. You'll need a tape measure.",
    '',
    `${origin}${path}`,
    '',
    'Thanks!',
  ].join('\n');
  const mailto = `mailto:${encodeURIComponent(managerEmail || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="ss-share">
      {!open ? (
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
          Send to site manager
        </button>
      ) : (
        <div className="ss-share-body">
          <p className="hint" style={{ margin: '0 0 8px' }}>
            Send this to whoever can survey {siteName || 'the site'}. It opens the survey for this site only — they
            won&apos;t see the rest of your project.
          </p>
          <CopyLinkField path={path} />
          <div className="ss-share-actions">
            <a className="btn btn-ghost" href={mailto}>
              {managerEmail ? `Email ${managerName || managerEmail}` : 'Write an email'}
            </a>
            {!defaultOpen && (
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Close</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
