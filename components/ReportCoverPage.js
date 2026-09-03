// Print-only title band at the top of page 1. The summary panel (engineer,
// site contact, date, address) prints directly underneath it, so the first
// page of the export is the job's cover sheet rather than a title on its own.
// Address and date live in that panel, not here, to avoid printing them twice.
export function ReportCoverPage({ title, siteName, clientName }) {
  return (
    <div className="report-cover print-only">
      <div className="report-cover-kicker">{title}</div>
      <h1 className="report-cover-site">{siteName}</h1>
      {clientName && <div className="report-cover-client">{clientName}</div>}
    </div>
  );
}
