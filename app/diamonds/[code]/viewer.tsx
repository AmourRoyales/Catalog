"use client";

// Public catalog viewer. Wraps the same DiamondExplorer used by the
// authenticated "View Diamonds" page — same filter panel, same mobile
// drawer, same card grid and stone modal — pointed at this catalog's own
// (unauthenticated) search/facets routes instead of the admin ones.
import { useEffect } from "react";
import DiamondExplorer from "@/components/diamond/DiamondExplorer";
import type { StockRow } from "@/components/diamond/StoneDetail";

export type { StockRow };

const GENERIC_DIAMOND_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M8 4h16l6 8-14 16L2 12z" fill="none" stroke="#3E86C6" stroke-width="2" stroke-linejoin="round"/><path d="M2 12h28M11 4l-3 8 8 16M21 4l3 8-8 16" fill="none" stroke="#3E86C6" stroke-width="1.5" stroke-linejoin="round"/></svg>`
  );

export default function DiamondCatalogViewer({
  code, name, showPrice, showBranding, initialRows, total,
}: {
  code: string; name: string; showPrice: boolean; showBranding: boolean; initialRows: StockRow[]; total: number;
}) {
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

  return (
    <div className="min-h-screen bg-[#F5F8FB] flex flex-col">
      <header className="bg-[#16283A] px-4 sm:px-6 py-4 shrink-0">
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
        </div>
      </header>

      <DiamondExplorer
        facetsUrl={`/api/diamonds/${code}/facets`}
        searchUrl={`/api/diamonds/${code}`}
        showPrice={showPrice}
        showLocation={false}
        showCertSearch={false}
        heightClass="h-[calc(100vh-4.25rem)] sm:h-[calc(100vh-4.75rem)]"
        initialRows={initialRows}
        initialTotal={total}
      />

      {showBranding && (
        <footer className="py-3 text-center shrink-0 border-t border-gray-100 bg-white">
          <p className="font-serif text-xs text-[#3E86C6]">JeniDiam</p>
        </footer>
      )}
    </div>
  );
}
