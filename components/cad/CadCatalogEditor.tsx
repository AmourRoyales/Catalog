"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CAD_CATEGORIES, CAD_DATASET_LABEL, type CadDataset } from "@/lib/cad-constants";
import { METAL_PURITY_ORDER, METAL_LABEL, type Purity, type CadQuote } from "@/lib/cad-pricing";
import { formatPrice } from "@/lib/format";
import { CAD_PREFILL_KEY, type CadPrefill } from "@/lib/cad-prefill";
import type { CadCatalogItem } from "@/lib/cad-catalog";

type SearchDesign = {
  id: string;
  dataset: CadDataset;
  collection: string;
  code: string;
  type: string;
  tags: string[];
  cadUrl: string;
};

type ResultItem = {
  design: SearchDesign;
  quotes: Partial<Record<Purity, CadQuote>>;
  pricingKey: string;
  savedPrices?: CadCatalogItem["prices"];
};

const ALL_DATASETS: CadDataset[] = ["design", "luxe"];

function DesignCard({
  item, chosen, order, onView, actions, metals,
}: {
  item: ResultItem; chosen: boolean; order?: number; onView: () => void; actions: React.ReactNode; metals: Purity[];
}) {
  return (
    <div className={`bg-surface rounded-xl border overflow-hidden flex flex-col ${chosen ? "border-[#3E86C6]" : "border-gray-200"}`}>
      <button onClick={onView} className="relative block aspect-square bg-page group" title="View CAD">
        <img src={item.design.cadUrl} alt={item.design.code} loading="lazy" className="w-full h-full object-contain group-hover:scale-[1.03] transition" />
        {order != null && (
          <span className="absolute top-2 left-2 min-w-[22px] h-[22px] px-1 rounded-full bg-navy text-white text-[11px] font-semibold flex items-center justify-center">
            {order}
          </span>
        )}
        {chosen && order == null && (
          <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#3E86C6] text-white text-[11px] flex items-center justify-center">✓</span>
        )}
      </button>
      <div className="px-3 pt-2.5 pb-3 flex flex-col gap-2 flex-1">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">
            {item.design.code}
            <span className="ml-1.5 text-[10px] font-normal px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 align-middle">
              {CAD_DATASET_LABEL[item.design.dataset].split(" ")[0]}
            </span>
          </p>
          <p className="text-[11px] text-gray-500 truncate" title={`${item.design.type} · ${item.design.collection}`}>
            {item.design.type} · {item.design.collection}
          </p>
          <p className="text-[11px] text-gray-400 truncate">
            {metals.map((m) => `${METAL_LABEL[m]?.split(" ")[0] ?? m}: ${item.quotes[m] ? formatPrice(item.quotes[m]!.total) : "—"}`).join(" · ")}
            {metals.some((m) => item.quotes[m]?.certifiedSource === "certified") && <span className="ml-1.5 text-emerald-600">●</span>}
          </p>
        </div>
        <div className="mt-auto">{actions}</div>
      </div>
    </div>
  );
}

export default function CadCatalogEditor({ catalogId }: { catalogId?: string }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [metals, setMetals] = useState<Purity[]>(["14k"]);
  const [categories, setCategories] = useState<string[]>([CAD_CATEGORIES[0]]); // [] = all categories
  const [extraPercent, setExtraPercent] = useState(0);
  const [datasets, setDatasets] = useState<CadDataset[]>(ALL_DATASETS);
  const [showPrice, setShowPrice] = useState(true);
  const [showBranding, setShowBranding] = useState(true);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"AND" | "OR">("AND");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [tab, setTab] = useState<"designs" | "selected">("designs");
  const [viewing, setViewing] = useState<ResultItem | null>(null);

  const [results, setResults] = useState<ResultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [addingAll, setAddingAll] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedMap, setSelectedMap] = useState<Map<string, ResultItem>>(new Map());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(!catalogId);
  const [loadError, setLoadError] = useState("");
  const [repricing, setRepricing] = useState(false);
  const [revision, setRevision] = useState<string | null>(null);

  const requestSeq = useRef(0);
  const pricingKey = JSON.stringify([[...metals].sort(), extraPercent]);

  async function search_(body: Record<string, unknown>) {
    const res = await fetch("/api/cad-catalogs/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories, datasets, metals, extraPercent, search, mode, priceMin, priceMax, ...body }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load designs.");
    return { ...data, items: (data.items ?? []).map((item: ResultItem) => ({ ...item, pricingKey })) };
  }

  async function fetchPage(pageNum: number, replace: boolean) {
    const seq = ++requestSeq.current;
    if (replace) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await search_({ page: pageNum });
      if (seq !== requestSeq.current) return; // a newer filter change superseded this response
      setResults((prev) => (replace ? data.items : [...prev, ...data.items]));
      setTotal(data.total ?? 0);
      setPage(pageNum);
    } catch (err) {
      if (seq === requestSeq.current) setError(err instanceof Error ? err.message : "Could not load designs.");
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setViewing(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  // Debounced — fires on any filter change (metals, categories, extra %,
  // datasets, search, price range), 350ms after the last change.
  useEffect(() => {
    if (!initialized) return;
    // Invalidate immediately, before the debounce, so an older request
    // cannot replace results belonging to newer filters.
    requestSeq.current++;
    setLoading(true);
    const t = setTimeout(() => fetchPage(1, true), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, metals, extraPercent, datasets, search, mode, priceMin, priceMax, initialized]);

  useEffect(() => {
    if (!catalogId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cad-catalogs/${catalogId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load the catalog.");
        if (cancelled) return;
        const c = data.catalog;
        setName(c.name);
        setMetals(c.metals);
        setExtraPercent(c.extra_percent ?? 0);
        setShowPrice(c.show_price !== false);
        setShowBranding(c.show_branding !== false);
        setRevision(c.item_revision ?? null);
        setCategories(c.filters?.categories ?? c.categories ?? (c.category && c.category !== "All" ? [c.category] : []));
        setDatasets(c.filters?.datasets ?? ALL_DATASETS);
        setSearch(c.filters?.search ?? "");
        setMode(c.filters?.mode ?? "AND");
        setPriceMin(c.filters?.priceMin ?? "");
        setPriceMax(c.filters?.priceMax ?? "");
        const key = JSON.stringify([[...c.metals].sort(), c.extra_percent ?? 0]);
        const restored: ResultItem[] = data.items.map((item: CadCatalogItem & { tags: string[] }) => ({
          design: {
            id: item.design_id, dataset: item.dataset, collection: item.collection,
            code: item.design_code, type: item.design_type, cadUrl: item.cad_url, tags: item.tags,
          },
          quotes: Object.fromEntries(Object.entries(item.prices ?? {}).map(([metal, p]) => [metal, {
            ...p!.breakdown, total: p!.price, certifiedSource: p!.certifiedSource, flags: p!.breakdown?.flags ?? [],
          }])),
          savedPrices: item.prices,
          pricingKey: key,
        }));
        setSelectedIds(restored.map((item) => item.design.id));
        setSelectedMap(new Map(restored.map((item) => [item.design.id, item])));
        setTab("selected");
        setInitialized(true);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load the catalog.");
      }
    })();
    return () => { cancelled = true; };
  }, [catalogId]);

  // Reprice the entire selection when metals/markup change, including designs
  // outside the current search. Saved prices otherwise remain untouched.
  useEffect(() => {
    let cancelled = false;
    const staleIds = selectedIds.filter((id) => selectedMap.get(id)?.pricingKey !== pricingKey);
    if (!initialized || !metals.length || !staleIds.length) {
      setRepricing(false);
      return;
    }
    setRepricing(true);
    (async () => {
      try {
        const updated: ResultItem[] = [];
        for (let i = 0; i < staleIds.length; i += 200) {
          const data = await search_({ ids: staleIds.slice(i, i + 200) });
          if (cancelled) return;
          updated.push(...data.items);
        }
        if (updated.length !== staleIds.length) throw new Error("Some selected designs are no longer in the library. Remove them or restore the previous pricing settings.");
        setSelectedMap((prev) => {
          const next = new Map(prev);
          updated.forEach((item) => next.set(item.design.id, item));
          return next;
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not refresh pricing.");
      } finally {
        if (!cancelled) setRepricing(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metals, extraPercent, selectedIds, initialized]);

  // Arriving from Design Finder ("Create catalog"): adopt its filters, and if
  // it handed over a hand-picked selection, pre-add exactly those designs.
  useEffect(() => {
    if (catalogId) return;
    if (new URLSearchParams(window.location.search).get("from") !== "finder") return;
    let prefill: CadPrefill | null = null;
    try {
      const raw = sessionStorage.getItem(CAD_PREFILL_KEY);
      if (raw) prefill = JSON.parse(raw);
      sessionStorage.removeItem(CAD_PREFILL_KEY);
    } catch {
      /* storage blocked or corrupt — keep the defaults */
    }
    if (!prefill) return;
    setCategories(prefill.category ? [prefill.category] : []);
    setDatasets(prefill.datasets.length ? prefill.datasets : ALL_DATASETS);
    setSearch(prefill.search);
    setMode(prefill.mode);
    if (prefill.ids?.length) {
      search_({ ids: prefill.ids }).then((data) => (data.items as ResultItem[] | undefined)?.forEach(add)).catch((err) => setError(err.message));
    } else if (prefill.search || prefill.category) {
      // Whole result set of the finder search, not just the first page.
      search_({ all: true, categories: prefill.category ? [prefill.category] : [], datasets: prefill.datasets, search: prefill.search, mode: prefill.mode }).then((data) => {
        (data.items as ResultItem[] | undefined)?.forEach(add);
        if (data.truncated) setError(`Added the first ${data.items.length} of ${data.total} matching designs — narrow the filters to add the rest.`);
      }).catch((err) => setError(err.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleDataset(d: CadDataset) {
    setDatasets((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }
  function toggleMetal(m: Purity) {
    setMetals((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }
  function toggleCategory(category: string) {
    setCategories((prev) => prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]);
  }

  const available = useMemo(
    () => results.filter((r) => !selectedIds.includes(r.design.id)),
    [results, selectedIds]
  );
  const selected = useMemo(
    () => selectedIds.map((id) => selectedMap.get(id)).filter(Boolean) as ResultItem[],
    [selectedIds, selectedMap]
  );

  function add(item: ResultItem) {
    if (selectedIds.includes(item.design.id)) return;
    setSelectedIds((prev) => (prev.includes(item.design.id) ? prev : [...prev, item.design.id]));
    setSelectedMap((prev) => new Map(prev).set(item.design.id, item));
  }
  function remove(id: string) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }
  function move(id: string, dir: -1 | 1) {
    setSelectedIds((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function addAllVisible() {
    available.forEach(add);
  }

  // Fetches and adds EVERY design matching the current filters, not just
  // what's loaded on screen — server-capped (see ALL_MODE_CAP) so an
  // unfiltered search can't hang the request.
  async function addAllMatching() {
    setAddingAll(true);
    try {
      const data = await search_({ all: true });
      (data.items as ResultItem[]).forEach(add);
      if (data.truncated) {
        setError(
          `Added the first ${data.items.length} of ${data.total} matching designs — narrow the filters to add the rest.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add matching designs.");
    } finally {
      setAddingAll(false);
    }
  }

  async function handleSave() {
    setError("");
    if (!name.trim()) return setError("Catalog name is required.");
    if (metals.length === 0) return setError("Pick at least one metal.");
    if (selectedIds.length === 0) return setError("Add at least one design to the catalog.");
    if (repricing || selectedIds.some((id) => selectedMap.get(id)?.pricingKey !== pricingKey)) return setError("Wait for selected design prices to refresh before saving.");

    setSaving(true);
    try {
      const rows = selectedIds.map((id, i) => {
        const item = selectedMap.get(id)!;
        const prices: CadCatalogItem["prices"] = {};
        for (const metal of metals) {
          if (item.savedPrices?.[metal]) {
            prices[metal] = item.savedPrices[metal];
            continue;
          }
          const quote = item.quotes[metal];
          if (!quote) continue;
          prices[metal] = {
            price: Math.round(quote.total * 100) / 100,
            breakdown: quote,
            certifiedSource: quote.certifiedSource,
          };
        }
        return {
          design_id: item.design.id,
          dataset: item.design.dataset,
          collection: item.design.collection,
          design_code: item.design.code,
          design_type: item.design.type,
          cad_url: item.design.cadUrl,
          display_order: i,
          prices,
        };
      });
      const res = await fetch(catalogId ? `/api/cad-catalogs/${catalogId}` : "/api/cad-catalogs", {
        method: catalogId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          metals,
          filters: { categories, datasets, search, mode, priceMin, priceMax },
          revision,
          extra_percent: extraPercent,
          show_price: showPrice,
          show_branding: showBranding,
          items: rows,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save the catalog.");

      router.push("/cad-catalogs");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  if (loadError) return (
    <div className="p-8">
      <p role="alert" className="text-sm text-red-700 mb-4">{loadError}</p>
      <button onClick={() => router.push("/cad-catalogs")} className="text-sm text-[#3E86C6] hover:underline">Back to CAD catalogs</button>
    </div>
  );
  if (!initialized) return <div className="p-8 text-sm text-gray-500">Loading catalog…</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl text-ink">{catalogId ? "Edit CAD Catalog" : "New CAD Catalog"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Add designs from multiple categories, then review your selection before saving.
            {catalogId && " Changes update the existing share link."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/cad-catalogs")}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || repricing || addingAll}
            className="px-5 py-2 text-sm bg-[#3E86C6] hover:bg-[#2f6fa8] text-white font-semibold rounded-lg transition disabled:opacity-60"
          >
            {saving ? "Saving…" : repricing ? "Refreshing prices…" : catalogId ? "Save changes" : "Save & Publish"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Settings */}
      <div className="bg-surface border border-gray-200 rounded-xl p-5 mb-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Catalog name *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3E86C6]"
            placeholder="e.g. Solitaire Rings — Sep 2026"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Categories (pick one or more)
            </label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={categories.length === 0} onChange={() => setCategories([])} className="w-4 h-4 accent-[#3E86C6]" />
                All categories
              </label>
              {CAD_CATEGORIES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={categories.includes(c)} onChange={() => toggleCategory(c)} className="w-4 h-4 accent-[#3E86C6]" />
                  {c}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">Filters change the available designs. Your selected designs stay in the catalog.</p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Extra % (on top of 20%)
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={extraPercent}
              onChange={(e) => setExtraPercent(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3E86C6]"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Metals (pick one or more)
          </label>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {METAL_PURITY_ORDER.map((m) => (
              <label key={m} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={metals.includes(m)}
                  onChange={() => toggleMetal(m)}
                  className="w-4 h-4 accent-[#3E86C6]"
                />
                <span className="text-sm text-gray-700">{METAL_LABEL[m]}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Price range (any selected metal)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder="Min $"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3E86C6]"
            />
            <span className="text-gray-400 text-sm">–</span>
            <input
              type="number"
              min={0}
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder="Max $"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3E86C6]"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Design libraries
          </label>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {ALL_DATASETS.map((d) => (
              <label key={d} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={datasets.includes(d)}
                  onChange={() => toggleDataset(d)}
                  className="w-4 h-4 accent-[#3E86C6]"
                />
                <span className="text-sm text-gray-700">{CAD_DATASET_LABEL[d]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 md:col-span-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPrice}
              onChange={(e) => setShowPrice(e.target.checked)}
              className="w-4 h-4 accent-[#3E86C6]"
            />
            <span className="text-sm text-gray-700">Show price to viewers</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showBranding}
              onChange={(e) => setShowBranding(e.target.checked)}
              className="w-4 h-4 accent-[#3E86C6]"
            />
            <span className="text-sm text-gray-700">Show JeniDiam branding</span>
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-200 mb-4">
        {([["designs", "Designs"], ["selected", `Selected (${selected.length})`]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`pb-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
              tab === key ? "border-[#3E86C6] text-[#3E86C6]" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "designs" ? (
        <div className="bg-surface border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="text-sm font-semibold text-ink shrink-0">
              {loading ? "Searching…" : `${total.toLocaleString()} designs`}
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags, e.g. round, eternity, men's, size us 7…"
              className="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3E86C6]"
            />
            <div className="flex shrink-0 rounded-lg border border-gray-200 p-0.5" title="How comma-separated terms combine">
              {(["AND", "OR"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${mode === m ? "bg-[#3E86C6] text-white" : "text-gray-500 hover:bg-gray-50"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <p className="px-4 py-1.5 text-[10px] text-gray-400 border-b border-gray-100">
            Same as Design Finder — comma-separate terms ({mode}); write &quot;OR&quot; inside a term for any-of, e.g. &quot;2mm Each Round OR 0.2ct Each Princess&quot;.
          </p>

          {loading ? (
            <p className="p-4 text-sm text-gray-400">Loading…</p>
          ) : results.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">No designs match these filters.</p>
          ) : (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {results.map((item) => (
                <DesignCard
                  key={item.design.id}
                  item={item}
                  chosen={selectedIds.includes(item.design.id)}
                  metals={metals}
                  onView={() => setViewing(item)}
                  actions={
                    selectedIds.includes(item.design.id) ? (
                      <button onClick={() => remove(item.design.id)} className="w-full py-1.5 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-600 transition">
                        ✓ Added — remove
                      </button>
                    ) : (
                      <button onClick={() => add(item)} className="w-full py-1.5 text-xs font-semibold rounded-md bg-[#3E86C6] text-white hover:bg-[#2f6fa8] transition">
                        + Add
                      </button>
                    )
                  }
                />
              ))}
            </div>
          )}

          {results.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 flex flex-wrap items-center gap-4">
              <button onClick={addAllVisible} className="text-xs text-[#3E86C6] font-semibold hover:underline">
                + Add all {available.length} loaded
              </button>
              {results.length < total && (
                <button
                  onClick={() => fetchPage(page + 1, false)}
                  disabled={loadingMore}
                  className="text-xs text-gray-500 font-semibold hover:underline disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : `Load more (${(total - results.length).toLocaleString()} left)`}
                </button>
              )}
              <button
                onClick={addAllMatching}
                disabled={addingAll}
                className="text-xs text-ink font-semibold hover:underline disabled:opacity-50"
              >
                {addingAll ? "Adding…" : `Select all ${total.toLocaleString()} matching`}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">
              {selected.length} design{selected.length === 1 ? "" : "s"} in this catalog
            </span>
            {selected.length > 0 && (
              <button
                onClick={() => setSelectedIds([])}
                className="text-xs font-semibold text-red-500 hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
          {selected.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">
              Nothing selected yet — add designs from the Designs tab.
            </p>
          ) : (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {selected.map((item, i) => (
                <DesignCard
                  key={item.design.id}
                  item={item}
                  chosen
                  order={i + 1}
                  metals={metals}
                  onView={() => setViewing(item)}
                  actions={
                    <div className="flex items-center justify-between">
                      <div className="flex">
                        <button
                          onClick={() => move(item.design.id, -1)}
                          disabled={i === 0}
                          className="text-xs text-gray-400 hover:text-ink px-2 py-1 disabled:opacity-20 transition"
                          title="Move earlier"
                        >
                          ◀
                        </button>
                        <button
                          onClick={() => move(item.design.id, 1)}
                          disabled={i === selected.length - 1}
                          className="text-xs text-gray-400 hover:text-ink px-2 py-1 disabled:opacity-20 transition"
                          title="Move later"
                        >
                          ▶
                        </button>
                      </div>
                      <button
                        onClick={() => remove(item.design.id)}
                        className="text-xs font-semibold text-red-500 hover:text-red-700 px-2 py-1 transition"
                      >
                        Remove
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* CAD preview */}
      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
          <div className="bg-surface rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <p className="font-semibold text-ink">{viewing.design.code}</p>
                <p className="text-xs text-gray-400">
                  {viewing.design.type} · {viewing.design.collection} · {CAD_DATASET_LABEL[viewing.design.dataset]}
                </p>
              </div>
              <button onClick={() => setViewing(null)} className="text-2xl leading-none text-gray-400 hover:text-gray-700">
                ×
              </button>
            </div>
            <div className="p-5 grid md:grid-cols-[1.4fr_1fr] gap-5">
              <img src={viewing.design.cadUrl} alt={viewing.design.code} className="w-full rounded-lg bg-page object-contain" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Price</p>
                <div className="space-y-1 mb-4">
                  {metals.map((m) => (
                    <div key={m} className="flex justify-between text-sm">
                      <span className="text-gray-600">{METAL_LABEL[m]}</span>
                      <span className="font-semibold text-ink">
                        {viewing.quotes[m] ? formatPrice(viewing.quotes[m]!.total) : "—"}
                      </span>
                    </div>
                  ))}
                  {metals.some((m) => viewing.quotes[m]?.certifiedSource === "certified") && (
                    <p className="text-[11px] text-emerald-600">● priced from a certified stone</p>
                  )}
                  {metals.some((m) => (viewing.quotes[m]?.flags.length ?? 0) > 0) && (
                    <p className="text-[11px] text-amber-600">● estimated</p>
                  )}
                </div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {viewing.design.tags.map((t) => (
                    <span key={t} className="text-[11px] px-2 py-1 rounded-md bg-page text-gray-600">
                      {t}
                    </span>
                  ))}
                </div>
                {selectedIds.includes(viewing.design.id) ? (
                  <button
                    onClick={() => remove(viewing.design.id)}
                    className="w-full py-2 text-sm font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-600 transition"
                  >
                    ✓ In catalog — remove
                  </button>
                ) : (
                  <button
                    onClick={() => add(viewing)}
                    className="w-full py-2 text-sm font-semibold rounded-lg bg-[#3E86C6] text-white hover:bg-[#2f6fa8] transition"
                  >
                    + Add to catalog
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
