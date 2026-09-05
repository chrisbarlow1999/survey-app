'use client';

import { useRef, useState } from 'react';

// onChange fires with a PNG Blob once a stroke finishes, or null after Clear.
// existingUrl (edit flow only): shows the already-saved signature until the
// user explicitly chooses to replace it.
export function SignaturePad({ onChange, existingUrl }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [replacing, setReplacing] = useState(!existingUrl);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function start(e) {
    e.preventDefault();
    drawingRef.current = true;
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  }
  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (hasDrawn) {
      canvasRef.current.toBlob((blob) => onChange(blob), 'image/png');
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange(null);
  }

  if (!replacing && existingUrl) {
    return (
      <div className="signature-existing">
        <img src={existingUrl} alt="Signature" />
        <div className="overlay-toolbar">
          <button type="button" onClick={() => setReplacing(true)}>Replace Signature</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={500}
        height={160}
        className="signature-canvas"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="overlay-toolbar">
        <button type="button" onClick={clear}>Clear</button>
      </div>
      <p className="hint" style={{ margin: '6px 0 0' }}>Sign above using your finger or mouse.</p>
    </div>
  );
}
