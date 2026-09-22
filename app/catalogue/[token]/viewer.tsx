"use client";

import { useState, useEffect } from "react";
import { CATEGORIES } from "@/lib/jewelry-options";
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
  carat: number | null;
  description: string | null;
  product_media: Media[];
};

// Generic diamond favicon for shared catalogues — neutral gem, no brand association.
const GENERIC_DIAMOND_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M8 4h16l6 8-14 16L2 12z" fill="none" stroke="#3E86C6" stroke-width="2" stroke-linejoin="round"/><path d="M2 12h28M11 4l-3 8 8 16M21 4l3 8-8 16" fill="none" stroke="#3E86C6" stroke-width="1.5" stroke-linejoin="round"/></svg>`
  );

// Strip everything except letters/numbers, lowercase — "LR-367",
// "lr 367", "LR367" all match the same product. Kept in sync with
// the identical helpers in the admin products page.
function normalizeCode(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// True if any WORD in `text` starts with `term` — "red" matches
// "Red Ruby" but not "shared" or "tapered"; "solit" still finds
// "Solitaire".
function wordStartsWith(text: string, term: string): boolean {
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  return words.some((w) => w.startsWith(term));
}

type SortKey = "price-asc" | "price-desc" | "carat-asc" | "carat-desc";

// Price sorts are left out when a catalogue hides prices.
const SORT_OPTIONS: { value: SortKey; label: string; needsPrice: boolean }[] = [
  { value: "price-asc", label: "Price: Low to High", needsPrice: true },
  { value: "price-desc", label: "Price: High to Low", needsPrice: true },
  { value: "carat-asc", label: "Carat: Low to High", needsPrice: false },
  { value: "carat-desc", label: "Carat: High to Low", needsPrice: false },
];

// Pieces with no price/carat always go to the end, whichever direction.
function compareNullable(a: number | null, b: number | null, desc: boolean): number {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  return desc ? b - a : a - b;
}

export default function CatalogueViewer({
  name,
  showPrice,
  showDescription,
  showBranding,
  products,
}: {
  name: string;
  showPrice: boolean;
  showDescription: boolean;
  showBranding: boolean;
  products: Product[];
}) {
  const [openProduct, setOpenProduct] = useState<Product | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Default: cheapest first — or smallest carat when prices are hidden.
  const [sort, setSort] = useState<SortKey>(showPrice ? "price-asc" : "carat-asc");
  const sortOptions = SORT_OPTIONS.filter((o) => showPrice || !o.needsPrice);

  // Download state
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Downloads are allowed ONLY on white-label catalogues (branding off).
  // Branding on = watermark shown, downloads locked.
  const downloadsAllowed = !showBranding;

  // Browser tab title: brand only when branding is on
  useEffect(() => {
    document.title = showBranding ? `${name} — JeniDiam` : name;
  }, [name, showBranding]);

  // Catalogue favicon: always a generic diamond, never the site icon.
  useEffect(() => {
    const existing = document.querySelectorAll("link[rel~='icon']");
    existing.forEach((el) => el.parentNode?.removeChild(el));

    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = GENERIC_DIAMOND_FAVICON;
    document.head.appendChild(link);
  }, []);

  const catLabel = (v: string) =>
    CATEGORIES.find((c) => c.value === v)?.label ?? v;

  // Only offer filter options for categories that actually exist in this catalogue.
  const presentCategories = CATEGORIES.filter((c) =>
    products.some((p) => p.category === c.value)
  );

  // Category tab + word-start name search + normalized code search
  // (same matching rules as the admin products grid), then the chosen
  // sort. Ties keep the catalogue's own display order (sort is stable).
  const searchTerm = search.trim().toLowerCase();
  const searchCode = normalizeCode(search.trim());
  const sortField: "price" | "carat" = sort.startsWith("price") ? "price" : "carat";
  const sortDesc = sort.endsWith("desc");

  const shown = products
    .filter((p) => {
      if (filterCat !== "all" && p.category !== filterCat) return false;
      if (searchTerm) {
        const nameHit = wordStartsWith(p.name, searchTerm);
        const codeHit =
          searchCode.length > 0 &&
          normalizeCode(p.product_code).includes(searchCode);
        if (!nameHit && !codeHit) return false;
      }
      return true;
    })
    .sort((a, b) => compareNullable(a[sortField], b[sortField], sortDesc));

  function open(p: Product) {
    setOpenProduct(p);
    setMediaIndex(0);
  }

  const current = openProduct?.product_media[mediaIndex];

  // Download one product's media (mini-ZIP by code).
  async function handleProductDownload(e: React.MouseEvent, p: Product) {
    e.preventDefault();
    e.stopPropagation();
    if (busyId) return;
    setBusyId(p.id);
    try {
      await downloadProduct(p);
    } catch (err: any) {
      alert(err?.message || "Download failed.");
      console.error(err);
    } finally {
      setBusyId(null);
    }
  }

  // Download everything currently shown (respects category filter + search).
  async function handleBulkDownload() {
    if (bulkBusy) return;
    setBulkBusy(true);
    setProgress({ done: 0, total: 0 });
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const label = filterCat === "all" ? "catalogue" : filterCat;
      await downloadMany(shown, `${label}-${stamp}`, (done, total) =>
        setProgress({ done, total })
      );
    } catch (err: any) {
      alert(err?.message || "Download failed.");
      console.error(err);
    } finally {
      setBulkBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F8FB]">
      {/* Header */}
      <header className="bg-[#16283A] px-6 py-5 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            {showBranding ? (
              <>
                <h1 className="font-serif text-xl text-[#3E86C6]">JeniDiam</h1>
                <p className="text-[10px] tracking-[2px] text-white/40 uppercase mt-0.5">
                  {name}
                </p>
              </>
            ) : (
              <h1 className="font-serif text-xl text-white/90">{name}</h1>
            )}
          </div>
          <span className="text-xs text-white/40">
            {shown.length} {shown.length === 1 ? "piece" : "pieces"}
          </span>
        </div>
      </header>

      {/* Grid */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {products.length === 0 ? (
          <p className="text-center text-gray-400 py-24">
            This catalogue is currently empty.
          </p>
        ) : (
          <>
            {/* Category tabs — only categories present in this catalogue */}
            {presentCategories.length > 1 && (
              <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                {[{ value: "all", label: "All" }, ...presentCategories].map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setFilterCat(c.value)}
                    aria-pressed={filterCat === c.value}
                    className={`px-4 py-1.5 rounded-full text-sm border whitespace-nowrap transition ${
                      filterCat === c.value
                        ? "bg-[#16283A] text-white border-[#16283A]"
                        : "bg-white text-gray-600 border-gray-300 hover:border-[#16283A]"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {/* Controls row: search + sort + (white-label only) download all */}
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or code…"
                className="flex-1 min-w-[180px] px-3.5 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#3E86C6]"
              />

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort pieces"
                className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-[#16283A] focus:outline-none focus:border-[#3E86C6] cursor-pointer"
              >
                {sortOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              {downloadsAllowed && shown.length > 0 && (
                <button
                  onClick={handleBulkDownload}
                  disabled={bulkBusy}
                  className="ml-auto px-4 py-2 text-sm border border-[#16283A] text-[#16283A] font-semibold rounded-lg hover:bg-[#16283A] hover:text-white transition disabled:opacity-50 shrink-0"
                >
                  {bulkBusy
                    ? progress && progress.total > 0
                      ? `Zipping ${progress.done} of ${progress.total}…`
                      : "Preparing…"
                    : `↓ Download all (${shown.length})`}
                </button>
              )}
            </div>

            {shown.length === 0 ? (
              <p className="text-center text-gray-400 py-16">
                No pieces match your search.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {shown.map((p) => {
                  const cover = p.product_media[0];
                  return (
                    <button
                      key={p.id}
                      onClick={() => open(p)}
                      className="group text-left bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-[#3E86C6] hover:shadow-lg hover:shadow-[#3E86C6]/10 transition relative"
                    >
                      <div className="aspect-square bg-gradient-to-br from-[#eef3f8] to-[#e2eaf2] overflow-hidden flex items-center justify-center relative">
                        {cover ? (
                          cover.media_type === "video" ? (
                            <>
                              <video
                                src={cover.file_url}
                                className="w-full h-full object-cover"
                                muted
                                playsInline
                              />
                              <span className="absolute inset-0 flex items-center justify-center">
                                <span className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center text-sm">
                                  ▶
                                </span>
                              </span>
                            </>
                          ) : (
                            <img
                              src={cover.file_url}
                              alt={p.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            />
                          )
                        ) : (
                          <span className="text-3xl opacity-30">◈</span>
                        )}
                      </div>

                      {/* Per-product download — white-label only */}
                      {downloadsAllowed && p.product_media.length > 0 && (
                        <span
                          onClick={(e) => handleProductDownload(e, p)}
                          title="Download this product's media"
                          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur text-[#16283A] flex items-center justify-center shadow hover:bg-white transition text-sm cursor-pointer"
                        >
                          {busyId === p.id ? "…" : "↓"}
                        </span>
                      )}

                      <div className="p-3">
                        <p className="text-sm font-semibold text-[#16283A] truncate">
                          {p.name}
                        </p>
                        <p className="text-[11px] text-gray-400 mb-1.5">
                          {p.product_code}
                        </p>
                        <div className="flex flex-wrap gap-1 mb-1.5">
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
                        {showPrice && p.price != null && (
                          <p className="text-sm font-bold text-[#16283A]">
                            {formatPrice(p.price)}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer — only when branding is on */}
      {showBranding && (
        <footer className="py-8 text-center">
          <p className="font-serif text-sm text-[#3E86C6]">JeniDiam</p>
        </footer>
      )}

      {/* Detail overlay */}
      {openProduct && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-6"
          onClick={() => setOpenProduct(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* Media side */}
              <div className="bg-[#0d1520]">
                <div className="aspect-square flex items-center justify-center relative">
                  {current ? (
                    current.media_type === "video" ? (
                      <video
                        key={current.file_url}
                        src={current.file_url}
                        className="w-full h-full object-contain"
                        controls
                        controlsList={downloadsAllowed ? undefined : "nodownload"}
                        onContextMenu={
                          downloadsAllowed ? undefined : (e) => e.preventDefault()
                        }
                        autoPlay
                        loop
                        playsInline
                      />
                    ) : (
                      <img
                        src={current.file_url}
                        alt={openProduct.name}
                        className="w-full h-full object-contain"
                        onContextMenu={
                          downloadsAllowed ? undefined : (e) => e.preventDefault()
                        }
                      />
                    )
                  ) : (
                    <span className="text-4xl opacity-30 text-white">◈</span>
                  )}

                  {/* Watermark — bottom middle, only when branding is on */}
                  {showBranding && current && (
                    <img
                      src="/watermark.png"
                      alt=""
                      aria-hidden
                      className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 w-2/5 max-w-[220px] select-none"
                    />
                  )}
                </div>

                {openProduct.product_media.length > 1 && (
                  <div className="flex gap-2 p-3 overflow-x-auto">
                    {openProduct.product_media.map((m, i) => (
                      <button
                        key={i}
                        onClick={() => setMediaIndex(i)}
                        className={`w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2 ${
                          i === mediaIndex
                            ? "border-[#3E86C6]"
                            : "border-transparent opacity-60"
                        }`}
                      >
                        {m.media_type === "video" ? (
                          <div className="w-full h-full bg-black/60 flex items-center justify-center text-white text-xs">
                            ▶
                          </div>
                        ) : (
                          <img
                            src={m.file_url}
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Info side */}
              <div className="p-6 relative">
                <button
                  onClick={() => setOpenProduct(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition text-lg leading-none"
                >
                  ×
                </button>

                <p className="text-[11px] text-gray-400">{openProduct.product_code}</p>
                <h2 className="font-serif text-2xl text-[#16283A] mt-1">
                  {openProduct.name}
                </h2>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    {catLabel(openProduct.category)}
                  </span>
                  {openProduct.subcategory && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                      {openProduct.subcategory}
                    </span>
                  )}
                  {openProduct.stone_shape && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                      {openProduct.stone_shape}
                    </span>
                  )}
                </div>

                {showPrice && openProduct.price != null && (
                  <p className="font-serif text-3xl text-[#16283A] mt-5">
                    {formatPrice(openProduct.price)}
                  </p>
                )}

                {showDescription && openProduct.description && (
                  <p className="text-sm text-gray-600 leading-relaxed mt-5 whitespace-pre-wrap">
                    {openProduct.description}
                  </p>
                )}

                {/* Download this piece — white-label only */}
                {downloadsAllowed && openProduct.product_media.length > 0 && (
                  <button
                    onClick={(e) => handleProductDownload(e, openProduct)}
                    disabled={busyId === openProduct.id}
                    className="mt-6 w-full px-4 py-2.5 text-sm bg-[#16283A] hover:bg-[#1f3550] text-white font-semibold rounded-lg transition disabled:opacity-50"
                  >
                    {busyId === openProduct.id ? "Preparing…" : "↓ Download this piece"}
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