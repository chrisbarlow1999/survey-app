'use client';

import { useRef, useState } from 'react';

const DEFAULT_OVERLAY = { x: 30, y: 35, w: 35, h: 20 };

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

// New markers are offset from each other so several screens added in a row
// don't stack exactly on top of one another and look like a single box.
function nextOverlay(existing) {
  const step = 6;
  const n = existing.length;
  const x = clamp(DEFAULT_OVERLAY.x + n * step, 0, 100 - DEFAULT_OVERLAY.w);
  const y = clamp(DEFAULT_OVERLAY.y + n * step, 0, 100 - DEFAULT_OVERLAY.h);
  return { ...DEFAULT_OVERLAY, x, y };
}

// Lets the engineer drag/resize semi-transparent boxes over the uploaded photo
// to mark where each screen will go — one box per screen in the area, so the
// photo shows the whole wall laid out. Positions are stored as percentages of
// the image, so they hold at any display size.
export function PhotoWithOverlay({ photoSrc, overlays, onOverlaysChange, readOnly = false }) {
  const containerRef = useRef(null);
  const [drag, setDrag] = useState(null); // { index, mode, startX, startY, startOverlay }

  const list = Array.isArray(overlays) ? overlays : [];

  function startDrag(e, index, mode) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    e.target.setPointerCapture?.(e.pointerId);
    setDrag({ index, mode, startX: e.clientX, startY: e.clientY, startOverlay: list[index] });
  }

  function onPointerMove(e) {
    if (!drag || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100;
    const start = drag.startOverlay;
    if (!start) return;

    let updated;
    if (drag.mode === 'move') {
      updated = {
        ...start,
        x: clamp(start.x + dxPct, 0, 100 - start.w),
        y: clamp(start.y + dyPct, 0, 100 - start.h),
      };
    } else {
      updated = {
        ...start,
        w: clamp(start.w + dxPct, 8, 100 - start.x),
        h: clamp(start.h + dyPct, 8, 100 - start.y),
      };
    }
    onOverlaysChange(list.map((o, i) => (i === drag.index ? updated : o)));
  }

  function endDrag() {
    setDrag(null);
  }

  return (
    <div
      ref={containerRef}
      className="overlay-container"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <img src={photoSrc} alt="Site photo" />
      {list.map((ov, i) => (
        <div
          key={i}
          className="screen-marker"
          style={{ left: `${ov.x}%`, top: `${ov.y}%`, width: `${ov.w}%`, height: `${ov.h}%` }}
          onPointerDown={(e) => startDrag(e, i, 'move')}
        >
          <span className="screen-marker-label">{list.length > 1 ? i + 1 : 'Screen'}</span>
          {!readOnly && (
            <div className="screen-marker-handle" onPointerDown={(e) => startDrag(e, i, 'resize')} />
          )}
        </div>
      ))}
    </div>
  );
}

export { DEFAULT_OVERLAY, nextOverlay };
