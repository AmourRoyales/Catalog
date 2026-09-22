import type React from "react";

export const ACCENT = "#3E86C6";
export const TINT = "#DCE8F3";

// ---- Small UI pieces -----------------------------------------------------
export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-lg border border-gray-200 px-5 py-4 ${className}`}>
      {title && <h3 className="text-[13px] font-bold text-gray-900 mb-3">{title}</h3>}
      {children}
    </section>
  );
}

export function Pill({
  active, disabled, onClick, children, title, wide,
}: {
  active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; title?: string; wide?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`h-7 rounded-md text-[11px] font-medium transition ${wide ? "px-4" : "min-w-[58px] px-3"} ${
        active
          ? "text-white"
          : disabled
          ? "bg-gray-100 text-gray-300 cursor-not-allowed"
          : "bg-[#EEF0F3] text-gray-600 hover:bg-[#E2E5EA]"
      }`}
      style={active ? { background: ACCENT } : undefined}
    >
      {children}
    </button>
  );
}

export function Tabs<T extends string>({
  tabs, value, onChange,
}: {
  tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-4 border-b border-gray-200 -mx-5 px-5 mb-3">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`pb-2 text-[12px] font-semibold border-b-2 -mb-px transition ${
            value === t.value ? "" : "border-transparent text-gray-800"
          }`}
          style={value === t.value ? { color: ACCENT, borderColor: ACCENT } : undefined}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Expander({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full mt-3 h-4 rounded-full flex items-center justify-center text-[10px] text-gray-600"
      style={{ background: TINT }}
      aria-label={open ? "Show less" : "Show more"}
    >
      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.4" className={open ? "rotate-180" : ""}>
        <path d="M2 4l4 4 4-4" />
      </svg>
    </button>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-[11px] text-gray-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-3.5 h-3.5" style={{ accentColor: ACCENT }} />
      {label}
    </label>
  );
}

export function RangeBox({
  min, max, onMin, onMax, minPh, maxPh,
}: {
  min?: number; max?: number; onMin: (v?: number) => void; onMax: (v?: number) => void; minPh: string; maxPh: string;
}) {
  const cls = "w-full h-9 px-3 border border-gray-300 rounded-md text-xs focus:outline-none focus:border-gray-500";
  return (
    <div className="flex items-center gap-2">
      <input type="number" value={min ?? ""} placeholder={minPh} className={cls}
        onChange={(e) => onMin(e.target.value === "" ? undefined : Number(e.target.value))} />
      <span className="text-gray-400 text-xs">›</span>
      <input type="number" value={max ?? ""} placeholder={maxPh} className={cls}
        onChange={(e) => onMax(e.target.value === "" ? undefined : Number(e.target.value))} />
    </div>
  );
}

