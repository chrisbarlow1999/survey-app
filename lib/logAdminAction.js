// Best-effort — a failed log entry should never block the actual admin action.
// actor_id is left for the database's own default (auth.uid()) rather than
// passed here, so it can't be spoofed from the client.
export async function logAdminAction(supabase, action, target, details) {
  try {
    await supabase.from('admin_actions').insert({ action, target, details: details || {} });
  } catch {
    // ignore
  }
}
