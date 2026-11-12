import { createClient } from '../../../lib/supabaseServer';
import { EventList } from '../../../components/EventList';
import { SuggestEventsButton } from '../../../components/SuggestEventsButton';
import { needsChasing } from '../../../lib/events';
import { todayIso, addDays } from '../../../lib/installCalendar';

export const dynamic = 'force-dynamic';

const RANGES = [
  { weeks: 4, label: 'Next 4 weeks' },
  { weeks: 8, label: 'Next 8 weeks' },
  { weeks: 12, label: 'Next 12 weeks' },
];

// What's on at the venues we watch, and what's been chased.
//
// This replaces a prompt the content team ran every Monday. The prompt could
// tell them what was on; it could not remember what they had already asked for,
// which is the half that makes the work disappear.
export default async function EventsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const clientId = params.client || '';
  const showDismissed = params.dismissed === '1';
  const weeks = RANGES.some((r) => String(r.weeks) === params.weeks)
    ? Number(params.weeks)
    : 8;

  const today = todayIso();
  const to = addDays(today, weeks * 7);

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  const canEdit = profile?.role !== 'client_viewer';

  let query = supabase
    .from('venue_events')
    .select('id, event_date, end_date, title, event_type, status, content_status, source, source_note, notes, venue_id, event_venues!inner(id, name, town, client_id, clients(name))')
    .gte('event_date', today)
    .lte('event_date', to)
    .order('event_date', { ascending: true });

  if (clientId) query = query.eq('event_venues.client_id', clientId);
  // Dismissed drafts stay out of the way unless asked for — they're kept so the
  // same wrong fixture isn't re-suggested and re-read every week.
  if (!showDismissed) query = query.neq('status', 'dismissed');

  const [{ data: raw, error }, { data: clients }, { count: venueCount }] = await Promise.all([
    query,
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('event_venues').select('id', { count: 'exact', head: true }).eq('active', true),
  ]);

  // Flattened so the list component doesn't have to know the join shape.
  const events = (raw || []).map((e) => ({
    ...e,
    venue_name: e.event_venues?.name,
    town: e.event_venues?.town,
    client_name: e.event_venues?.clients?.name,
  }));

  const suggested = events.filter((e) => e.status === 'suggested').length;
  const toChase = events.filter((e) => e.status === 'confirmed' && needsChasing(e)).length;
  const ready = events.filter((e) => e.content_status === 'ready').length;

  function href(patch) {
    const sp = new URLSearchParams();
    if (clientId) sp.set('client', clientId);
    if (showDismissed) sp.set('dismissed', '1');
    sp.set('weeks', String(weeks));
    Object.entries(patch).forEach(([k, v]) => {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    });
    return `/events?${sp.toString()}`;
  }

  return (
    <main>
      <div className="stats-strip">
        <div className="stat-tile">
          <div className="stat-value">{events.length}</div>
          <div className="stat-label">Events In Range</div>
          <div className="stat-note">Next {weeks} weeks</div>
        </div>
        <div className={`stat-tile${suggested > 0 ? ' stat-tile-alert' : ''}`}>
          <div className="stat-value">{suggested}</div>
          <div className="stat-label">Need Checking</div>
          <div className="stat-note">AI drafts, unconfirmed</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{toChase}</div>
          <div className="stat-label">Still To Chase</div>
          <div className="stat-note">Confirmed, content not in</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{ready}</div>
          <div className="stat-label">Ready</div>
        </div>
      </div>

      <div className="panel" style={{ padding: '16px' }}>
        <h2>
          Client Events
          <a className="search-all" href="/events/venues">Manage the watch list</a>
        </h2>
        <p className="hint">
          What&apos;s on at the venues you watch, so content can be asked for early. Anything an AI
          drafted is marked and does nothing until you confirm it — check the date against the
          source before you email a client about it.
        </p>
        <form className="filter-row" method="get">
          <select name="client" defaultValue={clientId}>
            <option value="">All Clients</option>
            {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="weeks" defaultValue={String(weeks)}>
            {RANGES.map((r) => <option key={r.weeks} value={r.weeks}>{r.label}</option>)}
          </select>
          <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" name="dismissed" value="1" defaultChecked={showDismissed} />
            Show dismissed
          </label>
          <button className="btn btn-primary" type="submit">Filter</button>
          {(clientId || showDismissed || weeks !== 8) && <a className="btn btn-ghost" href="/events">Clear</a>}
        </form>
      </div>

      {canEdit && (
        <div className="panel" style={{ padding: '14px 16px' }}>
          <SuggestEventsButton from={today} to={to} venueCount={venueCount || 0} />
        </div>
      )}

      {error && (
        <div className="panel"><p className="error-text">Could not load events: {error.message}</p></div>
      )}

      {!error && <EventList events={events} canEdit={canEdit} today={today} />}
    </main>
  );
}
