'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../../../lib/supabaseClient';

// The self survey used to live here, under the tracking link. It now lives at
// /self-survey/<link> (migration 045) so it can be forwarded to a site manager
// without handing them the project tracker. This page only forwards older
// links and bookmarks to the right place.
export default function SelfSurveyRedirect({ params, searchParams }) {
  const { token } = use(params);
  const { site } = use(searchParams) || {};
  const supabase = createClient();
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    supabase.rpc('get_self_survey_links', { p_token: token }).then(({ data }) => {
      const siteLinks = Object.values(data?.sites || {});
      const link =
        (site && data?.sites?.[site])
        // One site and no ?site= — a single-site request.
        || (siteLinks.length === 1 ? siteLinks[0] : null)
        || (siteLinks.length === 0 ? data?.project : null);
      if (link) router.replace(`/self-survey/${link}`);
      else if (data && siteLinks.length > 1) router.replace(`/track/${token}`);
      else setFailed(true);
    });
  }, [token, site]);

  return (
    <main>
      <div className="panel">
        {failed ? (
          <>
            <h2>This link isn&apos;t active</h2>
            <p className="hint">Please get in touch with your Linney contact for an up-to-date link.</p>
          </>
        ) : (
          <p className="hint">Opening the self survey…</p>
        )}
      </div>
    </main>
  );
}
