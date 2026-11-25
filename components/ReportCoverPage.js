import { formatDate } from '../lib/formatDate';

// Page 1 of a printed report — the cover sheet. Everything in the cover itself
// is print-only; `children` (the page's summary panel: date, site contact,
// address, attachments, sign-off) renders on screen as normal and, on paper,
// sits inside the cover as its details card.
//
// On paper the cover fills the first A4 page: a brand header, the title, a row
// of headline figures, the details card, a list of what follows, and a footer
// pinned to the bottom of the page. Each area / issue still starts on its own
// page after it (.report-loc in globals.css), exactly as before.
//
//   stats    [{ label, value }] — up to four headline figures
//   contents { heading, items: [{ title, detail }] } — what the later pages hold
export function ReportCoverPage({ title, siteName, clientName, stats = [], contents = null, children }) {
  const generated = formatDate(new Date().toISOString().slice(0, 10));
  return (
    <div className="report-first-page">
      <div className="report-cover print-only">
        <div className="report-cover-brand">
          <span className="report-cover-wordmark">LINNEY</span>
          <span className="report-cover-doc">{title}</span>
        </div>

        <div className="report-cover-hero">
          <div className="report-cover-kicker">{title}</div>
          <h1 className="report-cover-site">{siteName || 'Untitled site'}</h1>
          {clientName && <div className="report-cover-client">Prepared for {clientName}</div>}
        </div>

        {stats.length > 0 && (
          <div className="report-cover-stats">
            {stats.map((s) => (
              <div className="report-cover-stat" key={s.label}>
                <div className="report-cover-stat-value">{s.value ?? '—'}</div>
                <div className="report-cover-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="report-cover-section-label">Site details</div>
      </div>

      {children}

      {contents && contents.items.length > 0 && (
        <div className="report-cover-contents print-only">
          <div className="report-cover-section-label">{contents.heading}</div>
          <ol>
            {contents.items.map((item, i) => (
              <li key={i}>
                <span className="report-cover-contents-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="report-cover-contents-title">{item.title}</span>
                {item.detail && <span className="report-cover-contents-detail">{item.detail}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="report-cover-footer print-only">
        <span>{clientName ? `${clientName} · ` : ''}{siteName}</span>
        <span>Prepared by Linney · {generated}</span>
      </div>
    </div>
  );
}
