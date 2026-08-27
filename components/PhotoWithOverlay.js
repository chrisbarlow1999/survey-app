'use client';

import { useRef, useState } from 'react';

const DEFAULT_OVERLAY = { x: 30, y: 35, w: 35, h: 20 };

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

// Lets the engineer drag/resize a semi-transparent box over the uploaded photo
// to mark roughly where the screen will go. Position/size are stored as
// percentages of the image, so it works at any display size.
export function PhotoWithOverlay({ photoSrc, overlay, onOverlayChange, readOnly = false }) {
  const containerRef = useRef(null);
  const [drag, setDrag] = useState(null); // { mode: 'move'|'resize', startX, startY, startOverlay }

  function startDrag(e, mode) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    e.target.setPointerCapture?.(e.pointerId);
    setDrag({ mode, startX: e.clientX, startY: e.clientY, startOverlay: overlay || DEFAULT_OVERLAY });
  }

  function onPointerMove(e) {
    if (!drag || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100;
    const start = drag.startOverlay;

    if (drag.mode === 'move') {
      const x = clamp(start.x + dxPct, 0, 100 - start.w);
      const y = clamp(start.y + dyPct, 0, 100 - start.h);
      onOverlayChange({ ...start, x, y });
    } else {
      const w = clamp(start.w + dxPct, 8, 100 - start.x);
      const h = clamp(start.h + dyPct, 8, 100 - start.y);
      onOverlayChange({ ...start, w, h });
    }
  }

  function endDrag() {
    setDrag(null);
  }

  const ov = overlay || DEFAULT_OVERLAY;

  return (
    <div
      ref={containerRef}
      className="overlay-container"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <img src={photoSrc} alt="Site photo" />
      {overlay && (
        <div
          className="screen-marker"
          style={{ left: `${ov.x}%`, top: `${ov.y}%`, width: `${ov.w}%`, height: `${ov.h}%` }}
          onPointerDown={(e) => startDrag(e, 'move')}
        >
          <span className="screen-marker-label">Screen</span>
          {!readOnly && (
            <div className="screen-marker-handle" onPointerDown={(e) => startDrag(e, 'resize')} />
          )}
        </div>
      )}
    </div>
  );
}

export { DEFAULT_OVERLAY };
