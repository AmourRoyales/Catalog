"use client";

import { useState } from "react";
import { CARAT_PRESETS, FLUORESCENCE_LABEL, WHITE_COLOR_GRADES, type DiamondFilters } from "@/lib/diamond-constants";
import { ACCENT, Card, Check, Expander, Pill, RangeBox, Tabs } from "@/components/diamond/ui";
import { SHAPE_TILES, ShapeIcon } from "@/components/diamond/shapes";

export type FacetValue = { value: string; count: number };
export type Facets = {
  shapes: FacetValue[]; whiteColors: FacetValue[]; fancyHues: FacetValue[];
  clarities: FacetValue[]; cuts: FacetValue[]; polishes: FacetValue[]; symms: FacetValue[];
  fluorescences: FacetValue[]; labs: FacetValue[]; locations: FacetValue[]; growthTypes: FacetValue[];
};

const CLARITIES = ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "SI3", "I1", "I2", "I3"];
const GRADES: [string, string][] = [
  ["ID", "Ideal"], ["EX", "Excellent"], ["VG", "Very Good"], ["GD", "Good"], ["FR", "Fair"], ["PR", "Poor"],
];
const FLUORESCENCE = ["NON", "SL", "VSL", "STG"];
const LABS = ["IGI", "GIA", "GCAL", "SGL"];

export const DEFAULT_FILTERS: DiamondFilters = { priceMode: "total", colorMode: "white" };

/** Number of filters actually narrowing the search (ignores the two mode toggles). */
export function activeFilterCount(f: DiamondFilters): number {
  return Object.entries(f).filter(([k, v]) => {
    if (k === "priceMode" || k === "colorMode") return false;
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== false;
  }).length;
}

/** The whole filter form — controlled; edits go to `setFilters`, nothing is fetched here. */
export default function DiamondFilterPanel({
  filters, setFilters, facets, showLocation = true,
}: {
  filters: DiamondFilters;
  setFilters: React.Dispatch<React.SetStateAction<DiamondFilters>>;
  facets: Facets;
  /** Location is internal warehouse info — the public catalog hides it. */
  showLocation?: boolean;
}) {
  const [colorsOpen, setColorsOpen] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);

  function setFilter<K extends keyof DiamondFilters>(key: K, value: DiamondFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }
  function toggleMany(key: keyof DiamondFilters, values: string[]) {
    setFilters((f) => {
      const cur = ((f[key] as string[] | undefined) ?? []) as string[];
      const allOn = values.every((v) => cur.includes(v));
      const next = allOn ? cur.filter((x) => !values.includes(x)) : Array.from(new Set([...cur, ...values]));
      return { ...f, [key]: next.length ? next : undefined };
    });
  }
  const has = (key: keyof DiamondFilters, v: string) => (((filters[key] as string[] | undefined) ?? []) as string[]).includes(v);
  const countOf = (list: FacetValue[] | undefined, value: string) => list?.find((f) => f.value === value)?.count ?? 0;
  const shapeCount = (values: string[]) => values.reduce((n, v) => n + countOf(facets.shapes, v), 0);

  // Only shapes actually in stock get a tile in the compact view; "more"
  // reveals the full list (greyed-out ones included), like the VDB search.
  const stocked = SHAPE_TILES.filter((t) => shapeCount(t.values) > 0);
  const tiles = shapesOpen ? SHAPE_TILES : stocked.slice(0, 8);
  const visibleWhite = colorsOpen ? WHITE_COLOR_GRADES : WHITE_COLOR_GRADES.slice(0, 14);

  return (
    <div className="space-y-3">
      <Card title="Show Only">
        <div className="space-y-2">
          <Check checked={!!filters.withMedia} onChange={(v) => setFilter("withMedia", v || undefined)} label="Items with Media" />
        </div>
      </Card>

      <Card title="Shape">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          {tiles.map((t) => {
            const n = shapeCount(t.values);
            const disabled = n === 0;
            const active = !disabled && t.values.some((v) => has("shapes", v));
            return (
              <button
                key={t.label}
                type="button"
                disabled={disabled}
                title={disabled ? "Not in your stock" : `${n} in stock`}
                onClick={() => toggleMany("shapes", t.values)}
                className={`h-[60px] rounded-md border flex flex-col items-center justify-center gap-0.5 transition ${
                  active ? "bg-[#EAF2FA]" : "bg-[#EEF0F3] border-transparent hover:bg-[#E2E5EA]"
                } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                style={active ? { borderColor: ACCENT } : undefined}
              >
                <ShapeIcon kind={t.icon} active={active} />
                <span className="text-[10px] text-gray-600 leading-none">{t.label}</span>
              </button>
            );
          })}
        </div>
        <Expander open={shapesOpen} onToggle={() => setShapesOpen((o) => !o)} />
      </Card>

      <Card title="Carat">
        <RangeBox min={filters.caratMin} max={filters.caratMax} onMin={(v) => setFilter("caratMin", v)} onMax={(v) => setFilter("caratMax", v)} minPh="Min, ct" maxPh="Max, ct" />
        <div className="flex flex-wrap gap-1.5 mt-3">
          {CARAT_PRESETS.map((p) => (
            <Pill
              key={p.label}
              wide
              active={filters.caratMin === p.min && filters.caratMax === p.max}
              onClick={() => setFilters((f) => ({ ...f, caratMin: p.min, caratMax: p.max }))}
            >
              {p.label}
            </Pill>
          ))}
        </div>
      </Card>

      <Card>
        <Tabs
          tabs={[{ value: "white", label: "White" }, { value: "fancy", label: "Fancy" }]}
          value={(filters.colorMode ?? "white") as "white" | "fancy"}
          onChange={(mode) => setFilters((f) => ({ ...f, colorMode: mode, colors: undefined, fancyHues: undefined }))}
        />
        <div className="mb-3">
          <Check checked={!!filters.noBgm} onChange={(v) => setFilter("noBgm", v || undefined)} label="No BGM" />
        </div>
        <h3 className="text-[13px] font-bold text-gray-900 mb-2">Color</h3>
        {(filters.colorMode ?? "white") === "white" ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {visibleWhite.map((g) => (
                <Pill key={g} active={has("colors", g)} onClick={() => toggleMany("colors", [g])} title={`${countOf(facets.whiteColors, g)} in stock`}>
                  {g}
                </Pill>
              ))}
            </div>
            <Expander open={colorsOpen} onToggle={() => setColorsOpen((o) => !o)} />
          </>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {facets.fancyHues.map((h) => (
              <Pill key={h.value} wide active={has("fancyHues", h.value)} onClick={() => toggleMany("fancyHues", [h.value])} title={`${h.count} in stock`}>
                {h.value}
              </Pill>
            ))}
          </div>
        )}
      </Card>

      <Card title="Clarity">
        <div className="mb-3">
          <Check checked={!!filters.eyeClean} onChange={(v) => setFilter("eyeClean", v || undefined)} label="Eye Clean" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CLARITIES.map((c) => (
            <Pill key={c} active={has("clarities", c)} disabled={countOf(facets.clarities, c) === 0} onClick={() => toggleMany("clarities", [c])} title={`${countOf(facets.clarities, c)} in stock`}>
              {c}
            </Pill>
          ))}
        </div>
      </Card>

      <Card title="Cut, Polish, Symmetry">
        {([["Cut", "cuts", facets.cuts], ["Polish", "polishes", facets.polishes], ["Symmetry", "symms", facets.symms]] as const).map(([label, key, list]) => (
          <div key={key} className="mb-3 last:mb-0">
            <p className="text-[12px] font-bold text-gray-900 mb-1.5">{label}</p>
            <div className="flex flex-wrap gap-1.5">
              {GRADES.map(([code, text]) => (
                <Pill key={code} wide active={has(key, code)} disabled={countOf(list, code) === 0} onClick={() => toggleMany(key, [code])} title={`${countOf(list, code)} in stock`}>
                  {text}
                </Pill>
              ))}
            </div>
          </div>
        ))}
      </Card>

      <Card title="Fluorescence">
        <div className="flex flex-wrap gap-1.5">
          {FLUORESCENCE.map((f) => (
            <Pill key={f} wide active={has("fluorescences", f)} disabled={countOf(facets.fluorescences, f) === 0} onClick={() => toggleMany("fluorescences", [f])} title={`${countOf(facets.fluorescences, f)} in stock`}>
              {FLUORESCENCE_LABEL[f]}
            </Pill>
          ))}
        </div>
      </Card>

      <Card title="Lab">
        <div className="flex flex-wrap gap-1.5">
          {LABS.map((l) => (
            <Pill key={l} active={has("labs", l)} disabled={countOf(facets.labs, l) === 0} onClick={() => toggleMany("labs", [l])} title={`${countOf(facets.labs, l)} in stock`}>
              {l}
            </Pill>
          ))}
        </div>
      </Card>

      <Card>
        <Tabs
          tabs={[{ value: "total", label: "Total Price" }, { value: "per_ct", label: "P/ct" }]}
          value={(filters.priceMode ?? "total") as "total" | "per_ct"}
          onChange={(mode) => setFilters((f) => ({ ...f, priceMode: mode }))}
        />
        <RangeBox min={filters.priceMin} max={filters.priceMax} onMin={(v) => setFilter("priceMin", v)} onMax={(v) => setFilter("priceMax", v)} minPh="Min, $" maxPh="Max, $" />
      </Card>

      {showLocation && (
        <Card title="Location">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {facets.locations.map((l) => (
              <Pill key={l.value} wide active={(filters.locations ?? []).includes(l.value)} onClick={() => toggleMany("locations", [l.value])} title={`${l.count} in stock`}>
                {l.value}
              </Pill>
            ))}
          </div>
          <Check checked={!!filters.excludeLocations} onChange={(v) => setFilter("excludeLocations", v || undefined)} label="Exclude Location(s)" />
        </Card>
      )}

      <Card title="Growth Type">
        <div className="flex flex-wrap gap-4">
          {["CVD", "HPHT", "Other"].map((g) => (
            <Check key={g} checked={has("growthTypes", g)} onChange={() => toggleMany("growthTypes", [g])} label={g === "Other" ? "Others" : g} />
          ))}
        </div>
      </Card>

      <Card title="Measurements">
        <div className="space-y-2">
          <RangeBox min={filters.depthPctMin} max={filters.depthPctMax} onMin={(v) => setFilter("depthPctMin", v)} onMax={(v) => setFilter("depthPctMax", v)} minPh="Depth, Min, %" maxPh="Depth, Max, %" />
          <RangeBox min={filters.tablePctMin} max={filters.tablePctMax} onMin={(v) => setFilter("tablePctMin", v)} onMax={(v) => setFilter("tablePctMax", v)} minPh="Table, Min, %" maxPh="Table, Max, %" />
          <RangeBox min={filters.ratioMin} max={filters.ratioMax} onMin={(v) => setFilter("ratioMin", v)} onMax={(v) => setFilter("ratioMax", v)} minPh="Ratio, Min" maxPh="Ratio, Max" />
          <RangeBox min={filters.lengthMin} max={filters.lengthMax} onMin={(v) => setFilter("lengthMin", v)} onMax={(v) => setFilter("lengthMax", v)} minPh="Length, Min, mm" maxPh="Length, Max, mm" />
          <RangeBox min={filters.widthMin} max={filters.widthMax} onMin={(v) => setFilter("widthMin", v)} onMax={(v) => setFilter("widthMax", v)} minPh="Width, Min, mm" maxPh="Width, Max, mm" />
          <RangeBox min={filters.depthMmMin} max={filters.depthMmMax} onMin={(v) => setFilter("depthMmMin", v)} onMax={(v) => setFilter("depthMmMax", v)} minPh="Depth, Min, mm" maxPh="Depth, Max, mm" />
        </div>
      </Card>
    </div>
  );
}
