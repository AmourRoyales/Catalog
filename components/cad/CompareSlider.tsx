"use client";

// Before/after image comparison slider — drag (mouse, touch, or arrow keys
// once focused) to reveal more of `after` over `before`. Used for matching
// CAD sets, where a compact card can't show two full images at once.
import { useCallback, useRef, useState } from "react";

export default function CompareSlider({
  before,
  after,
  beforeLabel,
  afterLabel,
  className,
}: {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  className?: string;
}) {
  const [pct, setPct] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.min(100, Math.max(0, next)));
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setFromClientX(e.clientX);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    setFromClientX(e.clientX);
  }
  function onPointerUp() {
    dragging.current = false;
  }

  return (
    <div
      ref={containerRef}
      className={`relative select-none touch-none overflow-hidden bg-[#F5F8FB] ${className ?? ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* Before (full width, underneath) */}
      <img src={before} alt={beforeLabel} draggable={false} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
      {/* After (clipped to the slider position, on top) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ clipPath: `inset(0 0 0 ${pct}%)` }}>
        <img src={after} alt={afterLabel} draggable={false} className="w-full h-full object-contain" />
      </div>

      {/* Labels */}
      <span className="absolute top-2 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">
        {beforeLabel}
      </span>
      <span className="absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">
        {afterLabel}
      </span>

      {/* Handle */}
      <div className="absolute inset-y-0 w-0.5 bg-white shadow pointer-events-none" style={{ left: `${pct}%` }} />
      <div
        role="slider"
        tabIndex={0}
        aria-label={`Compare ${beforeLabel} and ${afterLabel}`}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPct((p) => Math.max(0, p - 5));
          if (e.key === "ArrowRight") setPct((p) => Math.min(100, p + 5));
        }}
        className="absolute top-1/2 w-7 h-7 -mt-3.5 -ml-3.5 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center cursor-ew-resize focus:outline-none focus:ring-2 focus:ring-[#3E86C6]"
        style={{ left: `${pct}%` }}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="#16283A" strokeWidth="1.5" strokeLinecap="round">
          <path d="M5 3 2 8l3 5M11 3l3 5-3 5" />
        </svg>
      </div>
    </div>
  );
}
