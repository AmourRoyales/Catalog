"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import { METAL_LABEL, type Purity } from "@/lib/cad-pricing";
import { groupMatchingSets, type MatchingSetGroup } from "@/lib/matching-set";
import CompareSlider from "@/components/cad/CompareSlider";

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

/** Combined price of a pair (necklace + earring), for sorting/display. Null if either piece has no price for the current metal. */
function pairPrice(pair: MatchingSetGroup<CatalogItem>, metal: Purity): number | null {
  const a = pair.necklace.prices[metal]?.price;
  const b = pair.earring.prices[metal]?.price;
  return a != null && b != null ? a + b : null;
}

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
  const [openSet, setOpenSet] = useState<MatchingSetGroup<CatalogItem> | null>(null);
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
  const matches = (code: string) => !term || code.toLowerCase().includes(term);

  // Matching-set pairs (a necklace + its earring, from the Luxe "Necklace
  // Set" collection — see lib/matching-set.ts) get their own slider card and
  // a side-by-side modal, same as the internal Design Finder. Anything that
  // doesn't pair up (including every non-Luxe item) renders as a normal
  // single card, exactly as before.
  const { pairs, singles } = useMemo(
    () => groupMatchingSets(items, (i) => ({ code: i.design_code, dataset: i.dataset })),
    [items]
  );

  const shownPairs = pairs
    .filter((p) => matches(p.necklace.design_code) || matches(p.earring.design_code))
    .filter((p) => !showPrice || pairPrice(p, metal) != null)
    .sort((a, b) => {
      if (!showPrice) return a.necklace.display_order - b.necklace.display_order;
      const pa = pairPrice(a, metal)!;
      const pb = pairPrice(b, metal)!;
      return sort === "price-asc" ? pa - pb : pb - pa;
    });

  const shownSingles = singles
    .filter((i) => matches(i.design_code))
    .filter((i) => !showPrice || i.prices[metal] != null)
    .sort((a, b) => {
      if (!showPrice) return a.display_order - b.display_order;
      const pa = a.prices[metal]!.price;
      const pb = b.prices[metal]!.price;
      return sort === "price-asc" ? pa - pb : pb - pa;
    });

  const shownCount = shownPairs.length + shownSingles.length;

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
            {shownCount} {shownCount === 1 ? "piece" : "pieces"}
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

            {shownCount === 0 ? (
              <p className="text-center text-gray-400 py-16">No pieces match your search.</p>
            ) : (
              <>
                {shownPairs.length > 0 && (
                  <div className="mb-8">
                    {shownSingles.length > 0 && (
                      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Matching Sets</h2>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {shownPairs.map((pair) => {
                        const total = pairPrice(pair, metal);
                        return (
                          <button
                            key={pair.setCode}
                            onClick={() => setOpenSet(pair)}
                            className="group text-left bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-[#3E86C6] hover:shadow-lg hover:shadow-[#3E86C6]/10 transition"
                          >
                            <CompareSlider
                              before={pair.necklace.cad_url}
                              after={pair.earring.cad_url}
                              beforeLabel="Necklace"
                              afterLabel="Earring"
                              className="aspect-square"
                            />
                            <div className="p-3">
                              <p className="text-sm font-semibold text-[#16283A] truncate">Matching Set</p>
                              <p className="text-[11px] text-gray-400 mb-1.5">
                                {pair.necklace.design_code} + {pair.earring.design_code}
                              </p>
                              {showPrice && total != null && (
                                <p className="text-sm font-bold text-[#16283A]">{formatPrice(total)} the set</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {shownSingles.length > 0 && (
                  <div>
                    {shownPairs.length > 0 && (
                      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">More Designs</h2>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {shownSingles.map((item) => (
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
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {showBranding && (
        <footer className="py-8 text-center">
          <p className="font-serif text-sm text-[#3E86C6]">JeniDiam</p>
        </footer>
      )}

      {/* Single-design modal */}
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
                  {showPrice && open.prices[metal]?.certifiedSource === "certified" && (
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

      {/* Matching-set modal — both CADs side by side */}
      {openSet && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-6"
          onClick={() => setOpenSet(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <p className="font-serif text-lg text-[#16283A]">Matching Set</p>
                <p className="text-[11px] text-gray-400">
                  {openSet.necklace.design_code} + {openSet.earring.design_code}
                </p>
              </div>
              <button
                onClick={() => setOpenSet(null)}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-5 grid sm:grid-cols-2 gap-5">
              {([
                { label: "Necklace", item: openSet.necklace },
                { label: "Earring", item: openSet.earring },
              ] as const).map(({ label, item }) => (
                <div key={label}>
                  <div className="bg-[#0d1520] rounded-lg overflow-hidden">
                    <div className="aspect-square flex items-center justify-center relative">
                      <img src={item.cad_url} alt={`${label} ${item.design_code}`} className="w-full h-full object-contain" />
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
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2">
                    {label} · {item.design_code}
                  </p>
                  {showPrice && (
                    <p className="font-serif text-xl text-[#16283A] mt-1">{formatPrice(item.prices[metal]?.price)}</p>
                  )}
                </div>
              ))}
            </div>

            {showPrice && (
              <div className="mx-5 mb-5 flex items-center justify-between border-t border-gray-100 pt-4">
                <span className="text-sm text-gray-600">
                  Total for the set · <span className="text-[11px] text-gray-400">{METAL_LABEL[metal] ?? metal}</span>
                </span>
                <span className="font-serif text-2xl text-[#16283A]">{formatPrice(pairPrice(openSet, metal))}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
