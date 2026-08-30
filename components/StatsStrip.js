export function StatsStrip({ total, thisMonth, clientStats, totalLabel, monthLabel }) {
  return (
    <div className="stats-strip">
      <div className="stat-tile">
        <div className="stat-value">{total}</div>
        <div className="stat-label">{totalLabel}</div>
      </div>
      <div className="stat-tile">
        <div className="stat-value">{thisMonth}</div>
        <div className="stat-label">{monthLabel}</div>
      </div>
      {clientStats.length > 0 && (
        <div className="stat-tile stat-tile-clients">
          <div className="stat-label">By Client</div>
          <div className="stat-client-list">
            {clientStats.map(([name, count]) => (
              <span key={name} className="stat-client-badge">{name} · {count}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
