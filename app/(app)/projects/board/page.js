import { createClient } from '../../../../lib/supabaseServer';
import { ProjectBoard } from '../../../../components/ProjectBoard';
import { ProjectViewTabs } from '../../../../components/ProjectViewTabs';

export const dynamic = 'force-dynamic';

// The board deliberately isn't paginated: a board that only shows the first 25
// cards is worse than no board. It is capped, though — see BOARD_LIMIT.
const BOARD_LIMIT = 300;

export default async function ProjectBoardPage({ searchParams }) {
  const params = (await searchParams) || {};
  const q = (params.q || '').trim();
  const clientId = params.client || '';
  const owner = params.owner || '';

  const supabase = await createClient();

  let query = supabase
    .from('projects')
    .select('id, title, site_location, status, due_date, source, created_at, client_id, clients(id, name), owner:profiles!owner_id(id, full_name, email)')
    .is('archived_at', null);

  if (clientId) query = query.eq('client_id', clientId);
  if (owner === 'none') query = query.is('owner_id', null);
  else if (owner) query = query.eq('owner_id', owner);
  if (q) {
    const safeQ = q.replace(/[",()]/g, '');
    query = query.or(`title.ilike."%${safeQ}%",reference.ilike."%${safeQ}%",site_location.ilike."%${safeQ}%"`);
  }

  const [{ data: projects, error }, { data: clients }, { data: owners }, { data: { user } }] = await Promise.all([
    query
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(BOARD_LIMIT),
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('profiles').select('id, full_name, email').in('role', ['user', 'super_admin']).eq('active', true).order('full_name', { ascending: true }),
    supabase.auth.getUser(),
  ]);

  const { data: myProfile } = await supabase.from('profiles').select('full_name, email, role').eq('id', user.id).single();
  const canEdit = myProfile?.role !== 'client_viewer';
  const actorName = myProfile?.full_name || myProfile?.email || 'Unknown user';

  // Task and note counts for the card chips. Fetched as two flat lists and
  // tallied here rather than per-card: one round trip each, no N+1.
  const ids = (projects || []).map((p) => p.id);
  const [{ data: tasks }, { data: notes }] = ids.length
    ? await Promise.all([
        supabase.from('project_tasks').select('project_id, completed_at').in('project_id', ids),
        supabase.from('project_notes').select('project_id').in('project_id', ids),
      ])
    : [{ data: [] }, { data: [] }];

  const taskTally = {};
  (tasks || []).forEach((t) => {
    const e = taskTally[t.project_id] || { total: 0, done: 0 };
    e.total += 1;
    if (t.completed_at) e.done += 1;
    taskTally[t.project_id] = e;
  });
  const noteTally = {};
  (notes || []).forEach((n) => {
    noteTally[n.project_id] = (noteTally[n.project_id] || 0) + 1;
  });

  const cards = (projects || []).map((p) => ({
    ...p,
    taskTotal: taskTally[p.id]?.total || 0,
    taskDone: taskTally[p.id]?.done || 0,
    noteCount: noteTally[p.id] || 0,
  }));

  return (
    <main className="project-main">
      <ProjectViewTabs current="board" params={params} />

      <div className="panel" style={{ padding: '14px 16px' }}>
        <form className="filter-row" method="get">
          <input type="text" name="q" placeholder="Search title, reference or site…" defaultValue={q} />
          <select name="client" defaultValue={clientId}>
            <option value="">All Clients</option>
            {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="owner" defaultValue={owner}>
            <option value="">All Owners</option>
            <option value="none">Unassigned</option>
            {(owners || []).map((o) => <option key={o.id} value={o.id}>{o.full_name || o.email}</option>)}
          </select>
          <button className="btn btn-primary" type="submit">Filter</button>
          {(q || clientId || owner) && <a className="btn btn-ghost" href="/projects/board">Clear</a>}
          <a className="btn btn-primary" href="/projects/new" style={{ marginLeft: 'auto' }}>+ New Project</a>
        </form>
      </div>

      {error && <p className="error-text">Could not load the board: {error.message}</p>}
      {cards.length >= BOARD_LIMIT && (
        <div className="archived-banner">
          Showing the first {BOARD_LIMIT} projects. Narrow it down with the filters above to be sure
          you're seeing everything.
        </div>
      )}

      <ProjectBoard projects={cards} actorName={actorName} canEdit={canEdit} />
    </main>
  );
}
