import { createClient } from '../../../../lib/supabaseServer';
import { HardwareManagementPanel } from '../../../../components/HardwareManagementPanel';

export const dynamic = 'force-dynamic';

export default async function AdminHardwarePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (myProfile?.role !== 'super_admin') {
    return (
      <main>
        <div className="empty-state">You don't have permission to view this page.</div>
      </main>
    );
  }

  const { data: items, error } = await supabase
    .from('hardware_items')
    .select('id, kind, key, label, model, width_mm, height_mm, active, position');

  return (
    <main>
      <div className="panel" style={{ padding: '12px 16px' }}>
        <h2>Hardware</h2>
        <p className="hint">
          The screens and mounts offered on the engineer survey form and the client self-survey. Changes
          show up on the forms straight away. Width and height are the landscape size in mm and drive the
          scale drawing on survey reports. Retiring an item takes it off the forms but keeps every survey
          that already uses it intact. Mounts can&apos;t be renamed, because surveys store the name; retire
          one and add its replacement instead. Each new item also gets a line in the cost-sheet price list,
          ready for a price.
        </p>
        {error ? (
          <div className="empty-state">
            Hardware can&apos;t be managed here yet. Run <code>supabase/048_hardware.sql</code> in the Supabase
            SQL Editor first; until then the forms use the built-in list.
          </div>
        ) : (
          <HardwareManagementPanel initialItems={items || []} />
        )}
      </div>
    </main>
  );
}
