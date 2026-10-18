"use client";

import { useEffect, useMemo, useState } from "react";
import ProductCard from "@/components/ProductCard";
import type { ThumbMedia } from "@/components/ProductThumb";
import { useRouter } from "next/navigation";
import { CATEGORIES, SUBCATEGORIES, STONE_SHAPES } from "@/lib/jewelry-options";

type Product = {
  id: string;
  product_code: string;
  name: string;
  category: string;
  subcategory: string | null;
  stone_shape: string | null;
  cover_url: string | null;
  /** All photos/videos in display order, for the thumbnail preview. */
  media: ThumbMedia[];
};

// Union of all stone shapes across every category (deduplicated)
const ALL_STONE_SHAPES: string[] = Array.from(
  new Set(Object.values(STONE_SHAPES).flatMap((s) => s.options))
);

export default function NewCataloguePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [showPrice, setShowPrice] = useState(true);
  const [showDescription, setShowDescription] = useState(true);
  const [showBranding, setShowBranding] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [stoneFilter, setStoneFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/products?status=active");
      const data: any[] | null = res.ok ? (await res.json()).products : null;

      if (data) {
        setProducts(
          data.map((p: any) => {
            const sorted = (p.product_media ?? []).sort(
              (a: any, b: any) => a.sort_order - b.sort_order
            );
            return {
              id: p.id,
              product_code: p.product_code,
              name: p.name,
              category: p.category,
              subcategory: p.subcategory,
              stone_shape: p.stone_shape,
              cover_url: sorted[0]?.file_url ?? null,
              media: sorted.map((m: any) => ({ file_url: m.file_url, media_type: m.media_type })),
            };
          })
        );
      }
      setLoading(false);
    }
    load();
  }, []);

  function handleCategoryFilterChange(value: string) {
    setCategoryFilter(value);
    setStyleFilter("");
    if (value && stoneFilter && !STONE_SHAPES[value].options.includes(stoneFilter)) {
      setStoneFilter("");
    }
  }

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedIds.includes(p.id)) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.product_code.toLowerCase().includes(q))
        return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (styleFilter && p.subcategory !== styleFilter) return false;
      if (stoneFilter && p.stone_shape !== stoneFilter) return false;
      return true;
    });
  }, [products, selectedIds, search, categoryFilter, styleFilter, stoneFilter]);

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => products.find((p) => p.id === id))
        .filter(Boolean) as Product[],
    [selectedIds, products]
  );

  function add(id: string) {
    setSelectedIds((prev) => [...prev, id]);
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
    setSelectedIds((prev) => [...prev, ...available.map((p) => p.id)]);
  }

  async function handleSave() {
    setError("");
    if (!name.trim()) return setError("Catalogue name is required.");
    if (selectedIds.length === 0)
      return setError("Add at least one product to the catalogue.");

    setSaving(true);
    try {
      const res = await fetch("/api/catalogues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          show_price: showPrice,
          show_description: showDescription,
          show_branding: showBranding,
          product_ids: selectedIds,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save the catalogue.");

      router.push("/catalogues");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setSaving(false);
    }
  }

  const catLabel = (v: string) =>
    CATEGORIES.find((c) => c.value === v)?.label ?? v;

  const styleOptions = categoryFilter
    ? SUBCATEGORIES[categoryFilter]?.options ?? []
    : [];
  const stoneOptions = categoryFilter
    ? STONE_SHAPES[categoryFilter]?.options ?? []
    : ALL_STONE_SHAPES;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl text-ink">New Catalogue</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Select products and configure sharing options.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/catalogues")}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm bg-[#3E86C6] hover:bg-[#2f6fa8] text-white font-semibold rounded-lg transition disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save & Publish"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Name + toggles */}
      <div className="bg-surface border border-gray-200 rounded-xl p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Catalogue name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3E86C6]"
              placeholder="e.g. Bridal 2026 — Premium"
            />
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2 pb-0.5">
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
                checked={showDescription}
                onChange={(e) => setShowDescription(e.target.checked)}
                className="w-4 h-4 accent-[#3E86C6]"
              />
              <span className="text-sm text-gray-700">Show description to viewers</span>
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
      </div>

      {/* Two-panel builder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT — available products */}
        <div className="bg-surface border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink shrink-0">
                All products
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or code…"
                className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3E86C6]"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => handleCategoryFilterChange(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-surface focus:outline-none focus:border-[#3E86C6]"
              >
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select
                value={styleFilter}
                onChange={(e) => setStyleFilter(e.target.value)}
                disabled={!categoryFilter}
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-surface focus:outline-none focus:border-[#3E86C6] disabled:opacity-40"
              >
                <option value="">All styles</option>
                {styleOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <select
                value={stoneFilter}
                onChange={(e) => setStoneFilter(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-surface focus:outline-none focus:border-[#3E86C6]"
              >
                <option value="">All stones</option>
                {stoneOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="h-[65vh] min-h-[420px] overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-gray-400">Loading…</p>
            ) : available.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">
                {products.length === 0
                  ? "No active products in your vault yet."
                  : "No products match — or all are already added."}
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3">
                {available.map((p) => (
                  <ProductCard
                    key={p.id}
                    media={p.media}
                    name={p.name}
                    code={p.product_code}
                    meta={[catLabel(p.category), p.subcategory, p.stone_shape].filter(Boolean).join(" · ")}
                  >
                    <button
                      onClick={() => add(p.id)}
                      className="flex-1 py-1.5 rounded-md text-xs font-semibold text-white bg-[#3E86C6] hover:bg-[#2f6fa8] transition"
                      title="Add to catalogue"
                    >
                      + Add
                    </button>
                  </ProductCard>
                ))}
              </div>
            )}
          </div>

          {available.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100">
              <button
                onClick={addAllVisible}
                className="text-xs text-[#3E86C6] font-semibold hover:underline"
              >
                + Add all {available.length} shown
              </button>
            </div>
          )}
        </div>

        {/* RIGHT — selected products */}
        <div className="bg-surface border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">
              In this catalogue
            </span>
            <span className="text-xs text-gray-400">
              {selected.length} products
            </span>
          </div>

          <div className="h-[calc(65vh+5.5rem)] min-h-[508px] overflow-y-auto">
            {selected.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">
                Nothing here yet — add products from the left panel.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3">
                {selected.map((p, i) => (
                  <ProductCard
                    key={p.id}
                    media={p.media}
                    name={p.name}
                    code={p.product_code}
                    corner={i + 1}
                  >
                    <button
                      onClick={() => move(p.id, -1)}
                      disabled={i === 0}
                      className="w-7 py-1 rounded-md text-xs text-gray-500 border border-gray-200 hover:text-ink hover:border-gray-300 disabled:opacity-30 transition"
                      title="Move earlier"
                      aria-label="Move earlier"
                    >
                      ◀
                    </button>
                    <button
                      onClick={() => move(p.id, 1)}
                      disabled={i === selected.length - 1}
                      className="w-7 py-1 rounded-md text-xs text-gray-500 border border-gray-200 hover:text-ink hover:border-gray-300 disabled:opacity-30 transition"
                      title="Move later"
                      aria-label="Move later"
                    >
                      ▶
                    </button>
                    <button
                      onClick={() => remove(p.id)}
                      className="ml-auto px-2 py-1 rounded-md text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition"
                      title="Remove from catalogue"
                    >
                      Remove
                    </button>
                  </ProductCard>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}