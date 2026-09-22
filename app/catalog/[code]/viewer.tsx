"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import { METAL_LABEL, type Purity } from "@/lib/cad-pricing";

type PriceEntry = { price: number; certifiedSource: string | null };

type CatalogItem = {
  design_id: string;
  dataset: string;
  design_code: string;
  design_type: string;
  cad_url: string;
  display_order: number;
  prices: Partial<Record<Purity, PriceEntry>>;
};

const GENERIC_DIAMOND_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M8 4h16l6 8-14 16L2 12z" fill="none" stroke="#3E86C6" stroke-width="2" stroke-linejoin="round"/><path d="M2 12h28M11 4l-3 8 8 16M21 4l3 8-8 16" fill="none" stroke="#3E86C6" stroke-width="1.5" stroke-linejoin="round"/></svg>`
  );

type SortKey = "price-asc" | "price-desc";

export default function CadCatalogViewer({
  name,
  metals,
  showPrice,
  showBranding,
  items,
}: {
  name: string;
  metals: Purity[];
  showPrice: boolean;
  showBranding: boolean;
  items: CatalogItem[];
}) {
  const [open, setOpen] = useState<CatalogItem | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("price-asc");
  const [metal, setMetal] = useState<Purity>(metals[0]);

  useEffect(() => {
    document.title = showBranding ? `${name} — JeniDiam` : name;

    const existing = document.querySelectorAll("link[rel~='icon']");
    existing.forEach((el) => el.parentNode?.removeChild(el));
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = GENERIC_DIAMOND_FAVICON;
    document.head.appendChild(link);
  }, [name, showBranding]);

  const term = search.trim().toLowerCase();
  const shown = items
    .filter((i) => !term || i.design_code.toLowerCase().includes(term))
    .filter((i) => i.prices[metal] != null)
    .sort((a, b) => {
      const pa = a.prices[metal]!.price;
      const pb = b.prices[metal]!.price;
      return sort === "price-asc" ? pa - pb : pb - pa;
    });

  return (
    <div className="min-h-screen bg-[#F5F8FB]">
      <header className="bg-[#16283A] px-6 py-5 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            {showBranding ? (
              <>
                <h1 className="font-serif text-xl text-[#3E86C6]">JeniDiam</h1>
                <p className="text-[10px] tracking-[2px] text-white/40 uppercase mt-0.5">{name}</p>
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {items.length === 0 ? (
          <p className="text-center text-gray-400 py-24">This catalog is currently empty.</p>
        ) : (
          <>
            {metals.length > 1 && (
              <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                {metals.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetal(m)}
                    aria-pressed={metal === m}
                    className={`px-4 py-1.5 rounded-full text-sm border whitespace-nowrap transition ${
                      metal === m
                        ? "bg-[#16283A] text-white border-[#16283A]"
                        : "bg-white text-gray-600 border-gray-300 hover:border-[#16283A]"
                    }`}
                  >
                    {METAL_LABEL[m] ?? m}
                  </button>
                ))}
              </div>
            )}

            <div className="mb-6 flex flex-wrap items-center gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by code…"
                className="flex-1 min-w-[180px] px-3.5 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#3E86C6]"
              />
              {showPrice && (
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  aria-label="Sort pieces"
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-[#16283A] focus:outline-none focus:border-[#3E86C6] cursor-pointer"
                >
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                </select>
              )}
            </div>

            {shown.length === 0 ? (
              <p className="text-center text-gray-400 py-16">No pieces match your search.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {shown.map((item) => (
                  <button
                    key={item.design_id}
                    onClick={() => setOpen(item)}
                    className="group text-left bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-[#3E86C6] hover:shadow-lg hover:shadow-[#3E86C6]/10 transition"
                  >
                    <div className="aspect-square bg-gradient-to-br from-[#eef3f8] to-[#e2eaf2] overflow-hidden flex items-center justify-center">
                      <img
                        src={item.cad_url}
                        alt={item.design_code}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-semibold text-[#16283A] truncate">{item.design_code}</p>
                      <p className="text-[11px] text-gray-400 mb-1.5">{item.design_type}</p>
                      {showPrice && (
                        <p className="text-sm font-bold text-[#16283A]">
                          {formatPrice(item.prices[metal]?.price)}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {showBranding && (
        <footer className="py-8 text-center">
          <p className="font-serif text-sm text-[#3E86C6]">JeniDiam</p>
        </footer>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-6"
          onClick={() => setOpen(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="bg-[#0d1520]">
                <div className="aspect-square flex items-center justify-center relative">
                  <img src={open.cad_url} alt={open.design_code} className="w-full h-full object-contain" />
                  {showBranding && (
                    <img
                      src="/watermark.png"
                      alt=""
                      aria-hidden
                      className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 w-2/5 max-w-[220px] select-none"
                    />
                  )}
                </div>
              </div>
              <div className="p-6 relative">
                <button
                  onClick={() => setOpen(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition text-lg leading-none"
                >
                  ×
                </button>
                <p className="text-[11px] text-gray-400">{open.design_code}</p>
                <h2 className="font-serif text-2xl text-[#16283A] mt-1">{open.design_type}</h2>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    {METAL_LABEL[metal] ?? metal}
                  </span>
                  {open.prices[metal]?.certifiedSource === "certified" && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                      Certified stone
                    </span>
                  )}
                </div>
                {showPrice && (
                  <p className="font-serif text-3xl text-[#16283A] mt-5">
                    {formatPrice(open.prices[metal]?.price)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
