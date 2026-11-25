import { createClient } from '../../../../lib/supabaseServer';
import { EngineerCompanyManagementPanel } from '../../../../components/EngineerCompanyManagementPanel';

export const dynamic = 'force-dynamic';

export default async function EngineerCompaniesSetupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  if (myProfile?.role !== 'super_admin') {
    return (
      <main>
        <div className="empty-state">You don't have permission to view this page.</div>
      </main>
    );
  }

  const { data: companies, error } = await supabase
    .from('engineer_companies')
    .select('id, name, active, position');

  return (
    <main>
      <div className="panel" style={{ padding: '12px 16px' }}>
        <h2>Engineer Companies</h2>
        <p className="hint">
          The firms offered on the survey, install and visit forms, and as the install team on projects
          and sites. Changes show up straight away. Retiring a firm takes it off the dropdowns but every
          record that already names it keeps it. Renaming a firm renames it on every past survey, install,
          visit and booking too, so the{' '}
          <a href="/companies">Engineer Companies report</a> and the install calendar keep counting it as
          one firm.
        </p>
        {error ? (
          <div className="empty-state">
            Firms can&apos;t be managed here yet. Run <code>supabase/050_engineer_companies.sql</code> in the
            Supabase SQL Editor first; until then the forms use the built-in list.
          </div>
        ) : (
          <EngineerCompanyManagementPanel initialCompanies={companies || []} />
        )}
      </div>
    </main>
  );
}
