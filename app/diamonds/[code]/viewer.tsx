"use client";

// Public catalog viewer. Wraps the same DiamondExplorer used by the
// authenticated "View Diamonds" page — same filter panel, same mobile
// drawer, same card grid and stone modal — pointed at this catalog's own
// (unauthenticated) search/facets routes instead of the admin ones.
import { useEffect, useState } from "react";
import DiamondExplorer from "@/components/diamond/DiamondExplorer";
import SetsTable, { type CatalogSet } from "@/components/diamond/SetsTable";
import { ThemeMenu } from "@/components/ThemeToggle";
import type { StockRow } from "@/components/diamond/StoneDetail";
import type { Facets } from "@/components/diamond/DiamondFilterPanel";

export type { StockRow, CatalogSet };

const GENERIC_DIAMOND_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M8 4h16l6 8-14 16L2 12z" fill="none" stroke="#3E86C6" stroke-width="2" stroke-linejoin="round"/><path d="M2 12h28M11 4l-3 8 8 16M21 4l3 8-8 16" fill="none" stroke="#3E86C6" stroke-width="1.5" stroke-linejoin="round"/></svg>`
  );

export default function DiamondCatalogViewer({
  code, name, showPrice, showBranding, initialRows, total, facets, sets,
}: {
  code: string; name: string; showPrice: boolean; showBranding: boolean; initialRows: StockRow[]; total: number; facets: Facets;
  /** A hand-picked catalog's matched sets — shown as a table tab beside the stone grid. */
  sets?: CatalogSet[];
}) {
  const [view, setView] = useState<"stones" | "sets">("stones");
  useEffect(() => {
    document.title = showBranding ? `${name} — JeniDiam` : name;
    // Repoint existing icons rather than removing them: React owns those
    // <link> nodes, and removing them under it breaks its later updates
    // ("Cannot read properties of null (reading 'removeChild')").
    const existing = document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']");
    existing.forEach((el) => {
      el.type = "image/svg+xml";
      el.href = GENERIC_DIAMOND_FAVICON;
    });
    if (!existing.length) {
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      link.href = GENERIC_DIAMOND_FAVICON;
      document.head.appendChild(link);
    }
  }, [name, showBranding]);

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <header className="bg-chrome px-4 sm:px-6 py-4 shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div>
            {showBranding ? (
              <>
                <h1 className="font-serif text-lg sm:text-xl text-[#3E86C6]">JeniDiam</h1>
                <p className="text-[10px] tracking-[2px] text-white/40 uppercase mt-0.5">{name}</p>
              </>
            ) : (
              <h1 className="font-serif text-lg sm:text-xl text-white/90">{name}</h1>
            )}
          </div>
          <ThemeMenu />
        </div>
      </header>

      {sets?.length ? (
        <nav className="bg-surface border-b border-gray-200 px-4 sm:px-6 shrink-0">
          <div className="max-w-[1600px] mx-auto flex gap-1">
            {([["stones", `All stones (${total})`], ["sets", `Sets table (${sets.length})`]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
                  view === key ? "border-[#3E86C6] text-[#3E86C6]" : "border-transparent text-gray-500 hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
      ) : null}

      {view === "sets" && sets?.length ? (
        <main className="flex-1">
          <SetsTable sets={sets} name={name} showPrice={showPrice} />
        </main>
      ) : (
        <DiamondExplorer
          facetsUrl={`/api/diamonds/${code}/facets`}
          searchUrl={`/api/diamonds/${code}`}
          showPrice={showPrice}
          showLocation={false}
          showCertSearch={false}
          heightClass={
            sets?.length
              ? "h-[calc(100vh-7rem)] sm:h-[calc(100vh-7.5rem)]"
              : "h-[calc(100vh-4.25rem)] sm:h-[calc(100vh-4.75rem)]"
          }
          initialRows={initialRows}
          initialTotal={total}
          initialFacets={facets}
        />
      )}

      {showBranding && (
        <footer className="py-3 text-center shrink-0 border-t border-gray-100 bg-surface">
          <p className="font-serif text-xs text-[#3E86C6]">JeniDiam</p>
        </footer>
      )}
    </div>
  );
}
