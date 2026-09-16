import { createClient } from '../../../../lib/supabaseServer';
import { formatDate } from '../../../../lib/formatDate';
import { CostSheetEditor } from '../../../../components/CostSheetEditor';
import { ArchiveButton } from '../../../../components/ArchiveButton';
import { CostSheetApprovalPanel } from '../../../../components/CostSheetApprovalPanel';

export const dynamic = 'force-dynamic';

export default async function CostSheetPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: sheet, error } = await supabase
    .from('cost_sheets')
    .select('*, clients(id, name), surveys(id, site_location, survey_date, locations)')
    .eq('id', id)
    .single();

  if (error || !sheet) {
    return (
      <main>
        <a className="back-link" href="/cost-sheets">&larr; Back to Cost Sheets</a>
        <div className="empty-state">Cost sheet not found, or you don&apos;t have access to it.</div>
      </main>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase
    .from('profiles').select('full_name, email, role').eq('id', user.id).single();
  const canEdit = myProfile?.role !== 'client_viewer';

  // The catalogue, and this client's rates for it. Both are only used to add
  // new lines — a line already on the sheet keeps the price it was saved with,
  // so re-pricing the catalogue never silently rewrites a quote.
  const [{ data: catalogue }, { data: clientRates }] = await Promise.all([
    supabase.from('price_items').select('id, name, unit, default_cost, default_price, match_key')
      .eq('active', true).order('name', { ascending: true }),
    supabase.from('price_client_rates').select('price_item_id, cost, price').eq('client_id', sheet.client_id),
  ]);

  return (
    <main className="project-main">
      <a className="back-link" href="/cost-sheets">&larr; Back to Cost Sheets</a>
      <div className="toolbar">
        {canEdit && (
          <ArchiveButton table="cost_sheets" recordId={sheet.id} archived={Boolean(sheet.archived_at)} />
        )}
        <a className="btn btn-ghost" href={`/dashboard/${sheet.survey_id}`}>Open the survey</a>
      </div>

      {sheet.archived_at && (
        <div className="archived-banner">
          This cost sheet is archived — it&apos;s hidden from the main list, and its client link no
          longer opens. Use Restore to bring it back.
        </div>
      )}

      <div className="panel">
        <h2 style={{ fontSize: 20 }}>
          {sheet.surveys?.site_location || 'Cost sheet'}
          {sheet.clients?.name ? <span className="client-badge" style={{ marginLeft: 10, verticalAlign: 'middle' }}>{sheet.clients.name}</span> : null}
        </h2>
        <div className="kv-grid">
          <div className="kv"><div className="k">Survey Date</div><div className="v">{sheet.surveys?.survey_date ? formatDate(sheet.surveys.survey_date) : '—'}</div></div>
          <div className="kv"><div className="k">Raised</div><div className="v">{formatDate(sheet.created_at)}</div></div>
          <div className="kv"><div className="k">Reference</div><div className="v">{sheet.reference || '—'}</div></div>
        </div>
      </div>

      <CostSheetApprovalPanel sheet={sheet} canEdit={canEdit} />

      <CostSheetEditor
        sheet={sheet}
        survey={sheet.surveys}
        catalogue={catalogue || []}
        clientRates={clientRates || []}
        canEdit={canEdit}
      />
    </main>
  );
}
