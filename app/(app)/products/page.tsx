"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CATEGORIES, SUBCATEGORIES, DIAMOND_SHAPES } from "@/lib/jewelry-options";
import { formatPrice } from "@/lib/format";
import { downloadProduct, downloadMany } from "@/lib/download";

type Media = {
  file_url: string;
  media_type: string;
  sort_order: number;
};

type Product = {
  id: string;
  product_code: string;
  name: string;
  category: string;
  subcategory: string | null;
  stone_shape: string | null;
  price: number | null;
  status: string;
  cover_url: string | null;
  cover_type: string | null;
  product_media: Media[];
};

const PAGE_SIZE = 50;

// Strip everything except letters and numbers, lowercase it.
// "LR-367" and "lr 367" both become "lr367" so they match.
function normalizeCode(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// True if any WORD in `text` starts with `term`.
// "red" matches "Red Ruby" but NOT "shared" or "tapered".
// "solit" still matches "Solitaire" (it starts that word).
function wordStartsWith(text: string, term: string): boolean {
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  return words.some((w) => w.startsWith(term));
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [stoneShape, setStoneShape] = useState("");
  const [status, setStatus] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Download state
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/products");
      const data: any[] | null = res.ok ? (await res.json()).products : null;

      if (data) {
        const mapped: Product[] = data.map((p: any) => {
          const sorted = (p.product_media ?? []).sort(
            (a: any, b: any) => a.sort_order - b.sort_order
          );
          const cover = sorted[0] ?? null;
          return {
            id: p.id,
            product_code: p.product_code,
            name: p.name,
            category: p.category,
            subcategory: p.subcategory,
            stone_shape: p.stone_shape,
            price: p.price,
            status: p.status,
            cover_url: cover?.file_url ?? null,
            cover_type: cover?.media_type ?? null,
            product_media: sorted,
          };
        });
        setProducts(mapped);
      }
      setLoading(false);
    }
    load();
  }, []);

  function handleCategoryChange(value: string) {
    setCategory(value);
    setSubcategory("");
  }

  const filtered = useMemo(() => {
    const raw = search.trim();
    const term = raw.toLowerCase();
    const codeTerm = normalizeCode(raw);

    return products.filter((p) => {
      if (raw) {
        // A product matches if EITHER:
        //  - a word in its name or description starts with the term, OR
        //  - its code (separators stripped) contains the stripped term.
        const nameHit = wordStartsWith(p.name, term);
        const codeHit =
          codeTerm.length > 0 &&
          normalizeCode(p.product_code).includes(codeTerm);
        if (!nameHit && !codeHit) return false;
      }
      if (category && p.category !== category) return false;
      if (subcategory && p.subcategory !== subcategory) return false;
      if (stoneShape && p.stone_shape !== stoneShape) return false;
      if (status && p.status !== status) return false;
      return true;
    });
  }, [products, search, category, subcategory, stoneShape, status]);

  const visible = filtered.slice(0, visibleCount);

  const catLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

  async function handleProductDownload(e: React.MouseEvent, p: Product) {
    e.preventDefault();
    e.stopPropagation();
    if (busyId) return;
    setBusyId(p.id);
    try {
      await downloadProduct(p);
    } catch (err: any) {
      alert(err?.message || "Download failed. See console for details.");
      console.error(err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleBulkDownload() {
    if (bulkBusy) return;
    setBulkBusy(true);
    setProgress({ done: 0, total: 0 });
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadMany(filtered, `jenidiam-${stamp}`, (done, total) =>
        setProgress({ done, total })
      );
    } catch (err: any) {
      alert(err?.message || "Download failed. See console for details.");
      console.error(err);
    } finally {
      setBulkBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#16283A]">Products</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? "Loading…" : `${filtered.length} of ${products.length} products`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!loading && filtered.length > 0 && (
            <button
              onClick={handleBulkDownload}
              disabled={bulkBusy}
              className="px-4 py-2 text-sm border border-[#16283A] text-[#16283A] font-semibold rounded-lg hover:bg-[#16283A] hover:text-white transition disabled:opacity-50"
            >
              {bulkBusy
                ? progress && progress.total > 0
                  ? `Zipping ${progress.done} of ${progress.total}…`
                  : "Preparing…"
                : `↓ Download all (${filtered.length})`}
            </button>
          )}
          <Link
            href="/products/new"
            className="px-5 py-2 text-sm bg-[#16283A] hover:bg-[#1f3550] text-white font-semibold rounded-lg transition"
          >
            + Add Product
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or code…"
          className="flex-1 min-w-[200px] px-3.5 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#3E86C6]"
        />
        <select
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#3E86C6]"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
          disabled={!category}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#3E86C6] disabled:opacity-40"
        >
          <option value="">All styles</option>
          {category &&
            SUBCATEGORIES[category]?.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
        </select>
        <select
          value={stoneShape}
          onChange={(e) => setStoneShape(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#3E86C6]"
        >
          <option value="">All diamond shapes</option>
          {DIAMOND_SHAPES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#3E86C6]"
        >
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-24 text-gray-400 text-sm">Loading products…</div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 rounded-2xl p-16 text-center">
          <p className="text-gray-500 font-medium">
            {products.length === 0 ? "No products yet." : "No products match your filters."}
          </p>
          {products.length === 0 && (
            <Link
              href="/products/new"
              className="inline-block mt-4 px-5 py-2 text-sm bg-[#3E86C6] text-white font-semibold rounded-lg hover:bg-[#2f6fa8] transition"
            >
              + Add your first product
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {visible.map((p) => (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                className="group bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-[#3E86C6] hover:shadow-lg hover:shadow-[#3E86C6]/10 transition relative"
              >
                <div className="aspect-square bg-gradient-to-br from-[#Eef3f8] to-[#e2eaf2] flex items-center justify-center overflow-hidden">
                  {p.cover_url ? (
                    p.cover_type === "video" ? (
                      <video
                        src={p.cover_url}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                      />
                    ) : (
                      <img
                        src={p.cover_url}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    )
                  ) : (
                    <span className="text-3xl opacity-30">◈</span>
                  )}
                </div>

                {p.product_media.length > 0 && (
                  <button
                    onClick={(e) => handleProductDownload(e, p)}
                    disabled={busyId === p.id}
                    title="Download this product's media"
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur text-[#16283A] flex items-center justify-center shadow hover:bg-white transition disabled:opacity-60 text-sm"
                  >
                    {busyId === p.id ? "…" : "↓"}
                  </button>
                )}

                <div className="p-3">
                  <p className="text-sm font-semibold text-[#16283A] truncate">{p.name}</p>
                  <p className="text-[11px] text-gray-400 mb-1.5">{p.product_code}</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                      {catLabel(p.category)}
                    </span>
                    {p.subcategory && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                        {p.subcategory}
                      </span>
                    )}
                    {p.stone_shape && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                        {p.stone_shape}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#16283A]">
                      {formatPrice(p.price)}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        p.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {p.status === "active" ? "Active" : "Draft"}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {filtered.length > visibleCount && (
            <div className="text-center py-6">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="text-sm text-[#3E86C6] font-semibold hover:underline"
              >
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}