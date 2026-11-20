'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { logProjectActivity } from '../lib/logProjectActivity';

// Attaches a survey / install / visit to a project after the fact. Engineers
// filling in the public forms have no idea which project a job belongs to, so
// this is always a PM action on the record's own page.
//
// Only projects for the same client are offered — a survey for Compass has no
// business hanging off a Starbucks project.
//
// Surveys can also name which site of the project they cover (migration 044),
// when the chosen project has sites. Before 044 the site list fails to load and
// the picker behaves exactly as it did.
export function ProjectLinkPicker({ table, recordId, currentProjectId, currentSiteId, projects, actorName, recordLabel }) {
  const supabase = createClient();
  const router = useRouter();
  const [value, setValue] = useState(currentProjectId || '');
  const [siteValue, setSiteValue] = useState(currentSiteId || '');
  const [sites, setSites] = useState([]);
  const [sitesSupported, setSitesSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const current = projects.find((p) => p.id === currentProjectId);
  const withSites = table === 'surveys';

  useEffect(() => {
    if (!withSites || !value) {
      setSites([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('project_sites')
      .select('id, site_name')
      .eq('project_id', value)
      .order('position', { ascending: true })
      .then(({ data, error: siteErr }) => {
        if (cancelled) return;
        setSitesSupported(!siteErr);
        setSites(data || []);
      });
    return () => { cancelled = true; };
  }, [value, withSites]);

  function chooseProject(next) {
    setValue(next);
    // A site belongs to one project; a new project means choosing again.
    if (next !== (currentProjectId || '')) setSiteValue('');
    else setSiteValue(currentSiteId || '');
  }

  const unchanged = value === (currentProjectId || '') && siteValue === (currentSiteId || '');

  async function save() {
    setBusy(true);
    setError('');
    const nextId = value || null;
    const update = { project_id: nextId };
    if (withSites && sitesSupported) update.project_site_id = nextId ? (siteValue || null) : null;
    const { error: updErr } = await supabase.from(table).update(update).eq('id', recordId);
    if (updErr) {
      console.error(updErr);
      setError('Could not update the linked project.');
      setBusy(false);
      return;
    }
    // Logged on both sides so unlinking leaves a trace on the project it left.
    if (currentProjectId && currentProjectId !== nextId) {
      await logProjectActivity(supabase, {
        projectId: currentProjectId, actorName, action: 'Record unlinked', detail: recordLabel,
      });
    }
    if (nextId && nextId !== currentProjectId) {
      await logProjectActivity(supabase, {
        projectId: nextId, actorName, action: 'Record linked', detail: recordLabel,
      });
    } else if (nextId && (siteValue || '') !== (currentSiteId || '')) {
      const siteName = sites.find((s) => s.id === siteValue)?.site_name;
      await logProjectActivity(supabase, {
        projectId: nextId, actorName, action: 'Record assigned to site', detail: `${recordLabel} → ${siteName || 'no site'}`,
      });
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="kv no-print" style={{ borderColor: 'var(--accent-cyan)' }}>
      <div className="k">Project</div>
      <div className="project-link-row">
        <select value={value} onChange={(e) => chooseProject(e.target.value)} disabled={busy}>
          <option value="">Not linked to a project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}{p.reference ? ` (${p.reference})` : ''}</option>
          ))}
        </select>
        {withSites && sites.length > 0 && (
          <select value={siteValue} onChange={(e) => setSiteValue(e.target.value)} disabled={busy} aria-label="Site">
            <option value="">No particular site</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
        )}
        <button
          className="btn btn-ghost"
          type="button"
          onClick={save}
          disabled={busy || unchanged}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {current && <a className="btn btn-ghost" href={`/projects/${current.id}`}>Open</a>}
      </div>
      {projects.length === 0 && (
        <p className="hint" style={{ margin: '8px 0 0' }}>
          No projects for this client yet.
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
