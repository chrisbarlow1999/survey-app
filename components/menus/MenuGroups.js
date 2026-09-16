import { groupOutlets, rangeKey, screenLabel, hasScreens } from '../../lib/menus';

// Which outlets could share a schedule, worked out from the ticks alone:
// same products under this menu set, and the same screens. Set against the
// schedules they're actually on today, so a disagreement shows up here
// instead of in someone's afternoon of comparing spreadsheets.
//
// Read-only and server-rendered. It proposes; it doesn't rename or move
// anything in MyScreens.
export function MenuGroups({ venueId, sections, products, outlets, sets, ranges, setId }) {
  const set = sets.find((s) => s.id === setId);
  if (!set) {
    return <div className="panel"><div className="empty-state">This venue has no menu sets yet.</div></div>;
  }

  const ticked = new Set(ranges.filter((r) => r.menu_set_id === setId).map((r) => rangeKey(r.outlet_id, r.product_id)));
  const groups = groupOutlets(outlets, products, ticked);
  const noScreens = outlets.filter((o) => !hasScreens(o));
  const sectionName = new Map(sections.map((s) => [s.id, s.name]));

  const shared = groups.filter((g) => g.outlets.length > 1);
  const scheduledOutlets = outlets.filter((o) => hasScreens(o) && o.current_schedule);
  const currentScheduleCount = new Set(scheduledOutlets.map((o) => o.current_schedule.toUpperCase().trim())).size;
  const flagged = groups.filter((g) => g.splitAcrossSchedules || g.sharedWithOtherRanges.length);

  const setHref = (id) => `/menus/${venueId}?tab=groups${id !== sets[0]?.id ? `&set=${id}` : ''}`;

  return (
    <>
      {sets.length > 1 && (
        <div className="view-tabs" style={{ marginBottom: 12 }}>
          {sets.map((s) => (
            <a key={s.id} className={s.id === setId ? 'on' : ''} href={setHref(s.id)}>{s.name}</a>
          ))}
        </div>
      )}

      <div className="stats-strip">
        <div className="stat-tile">
          <div className="stat-value">{groups.length}</div>
          <div className="stat-label">Schedules Needed</div>
          <div className="stat-note">Distinct range + screen layouts</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{currentScheduleCount || '—'}</div>
          <div className="stat-label">Schedules Today</div>
          <div className="stat-note">From the master schedule import</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{shared.length}</div>
          <div className="stat-label">Shared Groups</div>
          <div className="stat-note">Two or more outlets on one schedule</div>
        </div>
        <div className={`stat-tile${flagged.length ? ' stat-tile-alert' : ''}`}>
          <div className="stat-value">{flagged.length}</div>
          <div className="stat-label">To Check</div>
          <div className="stat-note">Ranges and schedules disagree</div>
        </div>
      </div>

      <div className="panel" style={{ padding: '12px 16px' }}>
        <p className="hint" style={{ marginTop: 0 }}>
          Groups for <strong>{set.name}</strong>. Outlets are grouped when they sell exactly the same
          products and have the same screens. Outlets with no screens are listed at the bottom and
          left out of the count.
        </p>
        {groups.length === 0 && <div className="empty-state">No outlets with screens have been set up yet.</div>}
        {groups.map((g, i) => (
          <details key={`${g.rangeFp}#${g.layoutFp}`} className="menu-group">
            <summary>
              <span className="menu-group-num">{i + 1}</span>
              <span className="menu-group-main">
                <span className="menu-group-outlets">{g.outlets.map((o) => o.name).join(', ')}</span>
                <span className="menu-group-meta">
                  {g.outlets.length} outlet{g.outlets.length === 1 ? '' : 's'} · {screenLabel(g.outlets[0])} · {g.sold.length} products
                  {g.schedules.length > 0 && <> · today: {g.schedules.join(', ')}</>}
                </span>
              </span>
              <span className="menu-group-flags">
                {g.splitAcrossSchedules && (
                  <span className="status-pill status-warn" title="These outlets sell the same products on the same screens but are on different schedules today.">
                    Split across schedules
                  </span>
                )}
                {g.sharedWithOtherRanges.length > 0 && (
                  <span className="status-pill status-no" title="Another outlet on the same schedule sells a different range, so one of them is showing the wrong menu.">
                    {g.sharedWithOtherRanges.join(', ')} mixes ranges
                  </span>
                )}
                {g.unscheduled.length > 0 && g.schedules.length > 0 && (
                  <span className="status-pill status-open">{g.unscheduled.length} not on a schedule</span>
                )}
                {g.sameRangeOtherLayouts > 0 && (
                  <span className="status-pill status-open" title="The same products are sold elsewhere on a different screen layout. The tariff slides can be reused there even though the schedule can't.">
                    Range also on {g.sameRangeOtherLayouts} other layout{g.sameRangeOtherLayouts === 1 ? '' : 's'}
                  </span>
                )}
              </span>
            </summary>
            <div className="menu-group-body">
              <table className="data-table menu-group-table">
                <thead>
                  <tr><th>Outlet</th><th>Store code</th><th>Menu</th><th>Screens</th><th>Schedule today</th></tr>
                </thead>
                <tbody>
                  {g.outlets.map((o) => (
                    <tr key={o.id}>
                      <td>{o.name}</td>
                      <td>{o.store_code || '—'}</td>
                      <td>{[o.menu_tier, o.menu_type].filter(Boolean).join(' · ') || '—'}</td>
                      <td>{screenLabel(o)}</td>
                      <td>{o.current_schedule || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="menu-group-products">
                {g.sold.length === 0
                  ? 'Sells nothing on this menu set.'
                  : groupBySection(g.sold, products, sectionName).map(([name, list]) => (
                      <div key={name}><strong>{name}:</strong> {list.join(', ')}</div>
                    ))}
              </div>
            </div>
          </details>
        ))}
      </div>

      {noScreens.length > 0 && (
        <div className="panel" style={{ padding: '12px 16px' }}>
          <h3 style={{ marginTop: 0 }}>No screens, or screens unknown ({noScreens.length})</h3>
          <p className="hint">
            Printed tariffs, Betfred box bars and anything else without a screen in MyScreens. Set a
            screen count on the Outlets tab if one of these does have screens.
          </p>
          <p style={{ margin: 0 }}>{noScreens.map((o) => `${o.name} (${screenLabel(o).toLowerCase()})`).join(', ')}</p>
        </div>
      )}
    </>
  );
}

function groupBySection(productIds, products, sectionName) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out = new Map();
  for (const id of productIds) {
    const p = byId.get(id);
    if (!p) continue;
    const s = sectionName.get(p.section_id) || 'Other';
    if (!out.has(s)) out.set(s, []);
    out.get(s).push(p.detail && /draught/i.test(p.detail) ? `${p.name} (draught)` : p.name);
  }
  return [...out.entries()];
}
