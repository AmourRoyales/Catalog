"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CAD_CATEGORIES, CAD_DATASET_LABEL, type CadDataset } from "@/lib/cad-constants";
import { CAD_PREFILL_KEY, type CadPrefill } from "@/lib/cad-prefill";
import CompareSlider from "@/components/cad/CompareSlider";

type Design = {
  id: string;
  dataset: CadDataset;
  collection: string;
  code: string;
  type: string;
  tags: string[];
  cadUrl: string;
};

type MatchingSet = { setCode: string; necklace: Design; earring: Design };

const ALL_DATASETS: CadDataset[] = ["design", "luxe"];
const PILLS = [{ value: "", label: "All Designs" }, ...CAD_CATEGORIES.map((c) => ({ value: c, label: `${c}s` }))];

export default function DesignFinderPage() {
  const router = useRouter();

  const [browseMode, setBrowseMode] = useState<"designs" | "sets">("designs");
  const [sets, setSets] = useState<MatchingSet[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [setsLoaded, setSetsLoaded] = useState(false);
  const [openSet, setOpenSet] = useState<MatchingSet | null>(null);

  const [category, setCategory] = useState("");
  const [datasets, setDatasets] = useState<CadDataset[]>(ALL_DATASETS);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"AND" | "OR">("AND");

  const [results, setResults] = useState<Design[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Design | null>(null);

  const requestSeq = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();
  const canSearch = !!trimmed || !!category;

  const runSearch = useCallback(
    async (pageNum: number, replace: boolean) => {
      const seq = ++requestSeq.current;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await fetch("/api/cad-catalogs/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: category || undefined, datasets, search: trimmed, mode, page: pageNum, withQuotes: false }),
        });
        const data = await res.json();
        if (seq !== requestSeq.current) return;
        setResults((prev) => (replace ? data.items.map((i: { design: Design }) => i.design) : [...prev, ...data.items.map((i: { design: Design }) => i.design)]));
        setTotal(data.total ?? 0);
        setPage(pageNum);
        setSearched(true);
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [category, datasets, trimmed, mode]
  );

  useEffect(() => {
    if (!canSearch) {
      requestSeq.current++;
      setResults([]);
      setTotal(0);
      setSearched(false);
      setLoading(false);
      return;
    }
    const t = setTimeout(() => runSearch(1, true), 300);
    return () => clearTimeout(t);
  }, [canSearch, runSearch]);

  const hasMore = results.length < total;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading && !loadingMore) runSearch(page + 1, false);
      },
      { rootMargin: "600px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadingMore, page, runSearch]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Matching sets are a small, fixed list — fetched once, the first time
  // that tab is opened.
  useEffect(() => {
    if (browseMode !== "sets" || setsLoaded) return;
    setSetsLoading(true);
    fetch("/api/cad-catalogs/matching-sets")
      .then((r) => r.json())
      .then((data) => setSets(data.sets || []))
      .finally(() => {
        setSetsLoading(false);
        setSetsLoaded(true);
      });
  }, [browseMode, setsLoaded]);

  useEffect(() => {
    if (!openSet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenSet(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSet]);

  function toggleDataset(d: CadDataset) {
    setDatasets((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }
  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitSelect() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function createCatalog(ids?: string[]) {
    const prefill: CadPrefill = { category, datasets, search: trimmed, mode, ids };
    try {
      sessionStorage.setItem(CAD_PREFILL_KEY, JSON.stringify(prefill));
    } catch {
      /* storage blocked — the builder just opens with its defaults */
    }
    router.push("/cad-catalogs/new?from=finder");
  }

  return (
    <div className="p-8 pb-28">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#16283A]">Design Finder</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Search CAD designs by tag combinations, then turn the results into a catalog.
          </p>
        </div>
        {browseMode === "designs" && (
          <button
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            className={`shrink-0 px-4 py-2 text-sm rounded-lg border transition ${
              selectMode ? "bg-[#3E86C6] border-[#3E86C6] text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50 bg-white"
            }`}
          >
            {selectMode ? "Cancel Select" : "Select"}
          </button>
        )}
      </div>

      {/* Browse mode */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit mb-6">
        {([
          { value: "designs", label: "Browse Designs" },
          { value: "sets", label: "Matching Sets" },
        ] as const).map((m) => (
          <button
            key={m.value}
            onClick={() => setBrowseMode(m.value)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
              browseMode === m.value ? "bg-[#3E86C6] text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {browseMode === "sets" ? (
        <div>
          <p className="text-sm text-gray-500 -mt-3 mb-5">
            Necklace + earring pairs from the Luxe library that were designed together. Drag the slider to compare, click a
            card to view both CADs side by side.
          </p>

          {setsLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : sets.length === 0 ? (
            <p className="text-sm text-gray-400">No matching sets found.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {sets.map((s) => (
                <button
                  key={s.setCode}
                  onClick={() => setOpenSet(s)}
                  className="text-left bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition"
                >
                  <CompareSlider
                    before={s.necklace.cadUrl}
                    after={s.earring.cadUrl}
                    beforeLabel="Necklace"
                    afterLabel="Earring"
                    className="aspect-square"
                  />
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-semibold text-[#16283A] truncate">Set {s.setCode}</p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {s.necklace.code} + {s.earring.code}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {PILLS.map((p) => (
          <button
            key={p.value}
            onClick={() => setCategory(p.value)}
            className={`px-4 py-1.5 text-sm font-medium rounded-full transition ${
              category === p.value ? "bg-[#3E86C6] text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-[#3E86C6]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Libraries */}
      <div className="mt-3 flex items-center gap-4">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Library</span>
        {ALL_DATASETS.map((d) => (
          <label key={d} className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={datasets.includes(d)} onChange={() => toggleDataset(d)} className="w-4 h-4 accent-[#3E86C6]" />
            <span className="text-sm text-gray-700">{CAD_DATASET_LABEL[d]}</span>
          </label>
        ))}
      </div>

      {/* Search + AND/OR */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Round, Eternity, US 7   or   2mm Each Round OR 0.2ct Each Princess, Tennis"
          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:border-[#3E86C6]"
        />
        <div className="flex shrink-0 rounded-lg border border-gray-200 bg-white p-1">
          {(["AND", "OR"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${mode === m ? "bg-[#3E86C6] text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        Separate terms with commas and combine them with the {mode} toggle. Inside one term, write &quot;OR&quot; to match any of
        those phrases (e.g. &quot;2mm Each Round OR 0.2ct Each Princess&quot;).
      </p>

      {/* Status */}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
        <span>{loading ? "Searching…" : searched ? `${total.toLocaleString()} design${total === 1 ? "" : "s"} found` : ""}</span>
        {searched && !loading && total > 0 && (
          <button onClick={() => createCatalog()} className="text-[#3E86C6] font-semibold hover:underline">
            Create catalog from all {total.toLocaleString()} →
          </button>
        )}
      </div>

      {!canSearch && (
        <p className="mt-10 text-center text-sm text-gray-400">Pick a category or type a search to find designs.</p>
      )}

      {/* Results */}
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {results.map((d) => {
          const selected = selectedIds.has(d.id);
          return (
            <div
              key={d.id}
              onClick={() => (selectMode ? toggleSelected(d.id) : setOpen(d))}
              className={`relative cursor-pointer bg-white rounded-xl border overflow-hidden transition hover:shadow-md ${
                selected ? "border-[#3E86C6] ring-2 ring-[#3E86C6]/40" : "border-gray-200"
              }`}
            >
              {selectMode && (
                <span
                  className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border flex items-center justify-center text-xs text-white ${
                    selected ? "bg-[#3E86C6] border-[#3E86C6]" : "bg-white/90 border-gray-300"
                  }`}
                >
                  {selected && "✓"}
                </span>
              )}
              <div className="aspect-square bg-[#F5F8FB]">
                <img src={d.cadUrl} alt={d.code} loading="lazy" className="w-full h-full object-contain" />
              </div>
              <div className="px-3 py-2.5">
                <p className="text-sm font-semibold text-[#16283A] truncate">
                  {d.code}
                  <span className="ml-1.5 text-[10px] font-normal px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 align-middle">
                    {CAD_DATASET_LABEL[d.dataset].split(" ")[0]}
                  </span>
                </p>
                <p className="text-[11px] text-gray-400 truncate">{d.tags.slice(0, 3).join(" · ")}</p>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && <div ref={sentinelRef} className="h-1" />}
      {loadingMore && <p className="mt-6 text-center text-sm text-gray-400">Loading more…</p>}
      {searched && !loading && results.length === 0 && (
        <p className="mt-10 text-center text-sm text-gray-400">No designs matched your search.</p>
      )}

      {/* Selection bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-6 pb-6 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-4 rounded-full border border-gray-200 bg-white px-5 py-3 shadow-lg">
            <span className="text-sm font-medium text-[#16283A]">{selectedIds.size} selected</span>
            <button onClick={() => setSelectedIds(new Set())} className="text-sm text-gray-400 hover:text-gray-700">
              Clear
            </button>
            <button
              onClick={() => createCatalog(Array.from(selectedIds))}
              className="rounded-full bg-[#3E86C6] hover:bg-[#2f6fa8] px-4 py-1.5 text-sm font-medium text-white"
            >
              Create catalog
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <p className="font-semibold text-[#16283A]">{open.code}</p>
                <p className="text-xs text-gray-400">
                  {open.type} · {open.collection} · {CAD_DATASET_LABEL[open.dataset]}
                </p>
              </div>
              <button onClick={() => setOpen(null)} className="text-2xl leading-none text-gray-400 hover:text-gray-700">
                ×
              </button>
            </div>
            <div className="p-5 grid md:grid-cols-2 gap-5">
              <img src={open.cadUrl} alt={open.code} className="w-full rounded-lg bg-[#F5F8FB] object-contain" />
              <div className="flex flex-wrap content-start gap-1.5">
                {open.tags.map((t) => (
                  <span key={t} className="text-[11px] px-2 py-1 rounded-md bg-[#F5F8FB] text-gray-600">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* Matching set modal — both CADs side by side */}
      {openSet && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setOpenSet(null)}>
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <p className="font-semibold text-[#16283A]">Matching Set {openSet.setCode}</p>
              <button onClick={() => setOpenSet(null)} className="text-2xl leading-none text-gray-400 hover:text-gray-700">
                ×
              </button>
            </div>
            <div className="p-5 grid sm:grid-cols-2 gap-5">
              {([
                { label: "Necklace", design: openSet.necklace },
                { label: "Earring", design: openSet.earring },
              ] as const).map(({ label, design }) => (
                <div key={label}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    {label} · {design.code}
                  </p>
                  <img src={design.cadUrl} alt={`${label} ${design.code}`} className="w-full aspect-square rounded-lg bg-[#F5F8FB] object-contain" />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {design.tags.slice(0, 8).map((t) => (
                      <span key={t} className="text-[11px] px-2 py-1 rounded-md bg-[#F5F8FB] text-gray-600">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
