// Renders a scaled technical drawing of the screen size, with mm dimension callouts.
// Plain component (no hooks/browser APIs) so it works in both client and server components.
export function BlueprintDiagram({ wmm, hmm, orientation }) {
  if (!wmm || !hmm) {
    return (
      <div className="blueprint">
        <div className="no-dim">No fixed dimensions for this model.<br />Measure on site and note below.</div>
      </div>
    );
  }
  let w = wmm, h = hmm;
  if (orientation === 'Portrait') { [w, h] = [h, w]; }
  const boxW = 170, boxH = 130;
  const leftMargin = 34, topMargin = 16, rightPad = 10, bottomPad = 10;
  const availW = boxW - leftMargin - rightPad;
  const availH = boxH - topMargin - bottomPad;
  const scale = Math.min(availW / w, availH / h);
  const rw = w * scale, rh = h * scale;
  const x = leftMargin + (availW - rw) / 2;
  const y = topMargin + (availH - rh) / 2;

  return (
    <div className="blueprint">
      <svg viewBox={`0 0 ${boxW} ${boxH}`} width="100%" height="150">
        <rect x="1" y="1" width={boxW - 2} height={boxH - 2} fill="none" stroke="var(--grid-line)" strokeWidth="1" />
        <rect x={x} y={y} width={rw} height={rh} fill="rgba(95,201,232,0.08)" stroke="var(--accent-cyan)" strokeWidth="1.5" />
        <line x1={x} y1={y - 6} x2={x + rw} y2={y - 6} stroke="var(--accent-cyan)" strokeWidth="0.75" />
        <text x={x + rw / 2} y={y - 9} fontSize="8" textAnchor="middle" fill="var(--accent-cyan)" fontFamily="var(--font-mono)">{w}mm</text>
        <line x1={x - 6} y1={y} x2={x - 6} y2={y + rh} stroke="var(--accent-cyan)" strokeWidth="0.75" />
        <text x={leftMargin / 2 - 2} y={y + rh / 2} fontSize="7.5" textAnchor="middle" dominantBaseline="middle" fill="var(--accent-cyan)" fontFamily="var(--font-mono)">{h}</text>
        <text x={leftMargin / 2 - 2} y={y + rh / 2 + 8} fontSize="7.5" textAnchor="middle" dominantBaseline="middle" fill="var(--accent-cyan)" fontFamily="var(--font-mono)">mm</text>
      </svg>
    </div>
  );
}
