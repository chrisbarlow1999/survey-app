// Best-effort append to a project's activity trail. Mirrors logAdminAction:
// never throws and never blocks the action it's recording, because losing a
// log line is always better than failing the thing the user actually asked for.
export async function logProjectActivity(supabase, { projectId, actorName, action, detail }) {
  try {
    await supabase.from('project_activity').insert({
      project_id: projectId,
      actor_name: actorName || 'Unknown user',
      action,
      detail: detail || null,
    });
  } catch {
    // swallowed on purpose
  }
}
