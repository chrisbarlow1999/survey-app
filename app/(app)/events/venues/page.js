import { createClient } from '../../../../lib/supabaseServer';
import { EventVenueManager } from '../../../../components/EventVenueManager';

export const dynamic = 'force-dynamic';

export default async function EventVenuesPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  const canEdit = profile?.role !== 'client_viewer';

  const [{ data: venues, error }, { data: clients }] = await Promise.all([
    supabase
      .from('event_venues')
      .select('id, name, kind, town, search_hint, active, client_id, clients(name)')
      .order('name', { ascending: true }),
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
  ]);

  return (
    <main>
      <a className="back-link" href="/events">&larr; Back to Events</a>

      <div className="panel">
        <h2>Event watch list</h2>
        <p className="hint">
          The venues the weekly draft asks about. Keep it to places that actually have dated events
          worth preparing content for — a shorter list makes each search sharper and cheaper, and
          stops the week view filling with offices that never have anything on.
        </p>
      </div>

      {error && (
        <div className="panel"><p className="error-text">Could not load venues: {error.message}</p></div>
      )}

      {!error && (
        <EventVenueManager venues={venues || []} clients={clients || []} canEdit={canEdit} />
      )}
    </main>
  );
}
