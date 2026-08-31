// Print-only title page. Hidden on screen entirely — it exists so the exported
// PDF opens on a proper cover rather than straight into detail, replacing the
// manually-built deck that used to serve that purpose.
export function ReportCoverPage({ title, siteName, clientName, date, address }) {
  return (
    <div className="report-cover print-only">
      <div className="report-cover-top">
        <div className="report-cover-kicker">{title}</div>
        <h1 className="report-cover-site">{siteName}</h1>
        {clientName && <div className="report-cover-client">{clientName}</div>}
      </div>
      <div className="report-cover-meta">
        {address && (
          <div>
            <div className="report-cover-label">Site Address</div>
            <div>{address}</div>
          </div>
        )}
        <div>
          <div className="report-cover-label">Date</div>
          <div>{date}</div>
        </div>
      </div>
    </div>
  );
}
