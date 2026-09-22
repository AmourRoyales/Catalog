"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FLUORESCENCE_LABEL, type DiamondFilters } from "@/lib/diamond-constants";
import { formatPrice } from "@/lib/format";
import DiamondFilterPanel, { DEFAULT_FILTERS, activeFilterCount, type Facets } from "@/components/diamond/DiamondFilterPanel";
import { SHAPE_TILES, ShapeIcon } from "@/components/diamond/shapes";
import { ACCENT } from "@/components/diamond/ui";
import StoneDetail, { type StockRow } from "@/components/diamond/StoneDetail";

export type ExplorerState = {
  /** The filters last applied (i.e. what the results on screen reflect). */
  filters: DiamondFilters;
  total: number;
  loading: boolean;
  /** True when the filter panel has edits that were not applied yet. */
  dirty: boolean;
  resetAll: () => void;
};

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const stoneTitle = (r: StockRow) => `${titleCase(r.shape)} ${Number(r.carat).toFixed(2)}ct ${r.color} ${r.clarity}`;
const gradeLine = (r: StockRow) =>
  `${r.cut || "-"}.${r.polish || "-"}.${r.symm || "-"}/${(r.fls && FLUORESCENCE_LABEL[r.fls]?.toUpperCase()) || r.fls || "NONE"}`;
const iconFor = (shape: string) => SHAPE_TILES.find((t) => t.values.includes(shape))?.icon ?? "circle";

function StoneImage({ row, className }: { row: StockRow; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!row.image_link || failed) {
    return (
      <div className={`flex items-center justify-center bg-[#E9ECF0] ${className ?? ""}`}>
        <ShapeIcon kind={iconFor(row.shape)} active={false} size={56} />
      </div>
    );
  }
  return <img src={row.image_link} alt={stoneTitle(row)} loading="lazy" onError={() => setFailed(true)} className={`object-cover bg-[#E9ECF0] ${className ?? ""}`} />;
}

/**
 * Filters on the left (collapsible — an overlay drawer on mobile, a static
 * sidebar from md up), matching stones as cards on the right. Filter edits
 * are staged and only searched on "Apply Filters", so `onState` consumers
 * (e.g. catalog creation) always see filters that match the results on
 * screen. `topBar` renders above both panes.
 *
 * Points at the admin (auth-gated) search/facets routes by default; the
 * public catalog page passes its own `/api/diamonds/[code]/*` routes so a
 * visitor's filter panel is scoped to that catalog's own saved filter.
 */
export default function DiamondExplorer({
  topBar,
  facetsUrl = "/api/diamond-catalogs/facets",
  searchUrl = "/api/diamond-catalogs/search",
  showPrice = true,
  showLocation = true,
  heightClass = "h-[calc(100vh-3.5rem)] md:h-screen",
  initialRows,
  initialTotal,
}: {
  topBar?: (state: ExplorerState) => React.ReactNode;
  facetsUrl?: string;
  searchUrl?: string;
  showPrice?: boolean;
  showLocation?: boolean;
  heightClass?: string;
  /** Seeds the first render (e.g. from a server component) so there's no blank flash before the client fetch lands. */
  initialRows?: StockRow[];
  initialTotal?: number;
}) {
  const [draft, setDraft] = useState<DiamondFilters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<DiamondFilters>(DEFAULT_FILTERS);
  const [panelOpen, setPanelOpen] = useState(true);

  const [facets, setFacets] = useState<Facets | null>(null);
  const [rows, setRows] = useState<StockRow[]>(initialRows ?? []);
  const [total, setTotal] = useState(initialTotal ?? 0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(!initialRows);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<StockRow | null>(null);

  const requestSeq = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Skips the very first auto-fetch when SSR already handed us page 1 for
  // the (unfiltered) default state — any later filter change still fetches.
  const skipFirstFetch = useRef(!!initialRows);

  useEffect(() => {
    fetch(facetsUrl).then((r) => r.json()).then(setFacets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facetsUrl]);

  const fetchPage = useCallback(
    async (pageNum: number, replace: boolean) => {
      const seq = ++requestSeq.current;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await fetch(searchUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters: applied, page: pageNum }),
        });
        const data = await res.json();
        if (seq !== requestSeq.current) return;
        setRows((prev) => (replace ? data.rows : [...prev, ...data.rows]));
        setTotal(data.total ?? 0);
        setPage(pageNum);
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [applied, searchUrl]
  );

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    fetchPage(1, true);
  }, [fetchPage]);

  const hasMore = rows.length < total;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading && !loadingMore) fetchPage(page + 1, false);
      },
      { root: scrollRef.current, rootMargin: "500px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadingMore, page, fetchPage]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(applied), [draft, applied]);
  const activeCount = activeFilterCount(applied);

  const resetAll = useCallback(() => {
    setDraft(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
  }, []);

  return (
    <div className={`flex flex-col ${heightClass} bg-[#F4F5F7]`}>
      {topBar?.({ filters: applied, total, loading, dirty, resetAll })}

      <div className="flex flex-1 min-h-0 relative">
        {/* Left: filters */}
        {panelOpen ? (
          <aside className="absolute inset-y-0 left-0 z-20 w-[min(400px,92vw)] md:static md:z-auto shrink-0 flex flex-col bg-white border-r border-gray-200 shadow-lg md:shadow-none">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
              <span className="text-sm font-semibold text-[#16283A]">Filters</span>
              <button
                onClick={() => setPanelOpen(false)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                aria-label="Collapse filters"
              >
                <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2L4 6l4 4" /></svg>
                Hide
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 bg-[#F4F5F7]">
              {facets ? (
                <DiamondFilterPanel filters={draft} setFilters={setDraft} facets={facets} showLocation={showLocation} />
              ) : (
                <p className="p-3 text-sm text-gray-400">Loading filters…</p>
              )}
            </div>
            <div className="flex gap-2 p-3 border-t border-gray-200 bg-white">
              <button
                onClick={resetAll}
                className="flex-1 h-10 rounded-md text-sm font-semibold text-gray-600 bg-[#EEF0F3] hover:bg-[#E2E5EA]"
              >
                Reset All
              </button>
              <button
                onClick={() => {
                  setApplied(draft);
                  if (window.matchMedia("(max-width: 767px)").matches) setPanelOpen(false);
                }}
                disabled={!dirty}
                className="flex-1 h-10 rounded-md text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: ACCENT }}
              >
                Apply Filters{dirty ? " •" : ""}
              </button>
            </div>
          </aside>
        ) : null}

        {/* Right: results */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200">
            {!panelOpen && (
              <button
                onClick={() => setPanelOpen(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 2l4 4-4 4" /></svg>
                Filters
                {activeCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] text-white flex items-center justify-center" style={{ background: ACCENT }}>
                    {activeCount}
                  </span>
                )}
              </button>
            )}
            <span className="text-sm font-semibold text-gray-800">
              {loading ? "Searching…" : `${total.toLocaleString()} stone${total === 1 ? "" : "s"}`}
            </span>
            {dirty && <span className="text-[11px] text-amber-600">Filters changed — hit Apply Filters</span>}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
              {rows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setOpen(r)}
                  className="text-left bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition"
                >
                  <StoneImage row={r} className="w-full aspect-[4/3.3]" />
                  <div className="px-3.5 pt-3 pb-3.5">
                    <p className="text-[15px] text-gray-900 leading-snug">{stoneTitle(r)}</p>
                    <p className="text-xs text-gray-500 mt-2">{gradeLine(r)}</p>
                    {showPrice ? (
                      <>
                        <p className="text-lg font-semibold text-gray-900 mt-2 leading-none">{formatPrice(r.amount)}</p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          Total Price · {formatPrice(r.rate)}/ct · {r.cert}
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] text-gray-500 mt-2">{r.cert}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {hasMore && <div ref={sentinelRef} className="h-1" />}
            {loadingMore && <p className="mt-4 text-center text-sm text-gray-400">Loading more…</p>}
            {!loading && rows.length === 0 && <p className="mt-10 text-center text-sm text-gray-400">No stones match these filters.</p>}
          </div>
        </div>
      </div>

      {open && <StoneDetail r={open} showPrice={showPrice} onClose={() => setOpen(null)} />}
    </div>
  );
}
