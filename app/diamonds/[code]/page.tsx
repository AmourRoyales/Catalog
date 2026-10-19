import { getDb } from "@/lib/mongo";
import { getScopedStockFacets, queryDiamondStock, type DiamondFilters } from "@/lib/diamond-stock-query";
import { catalogPricing, type PricedRow } from "@/lib/diamond-pricing";
import DiamondCatalogViewer, { type CatalogSet, type StockRow } from "./viewer";

type SavedSet = { name: string; stone_ids: string[] };

export default async function PublicDiamondCatalogPage({ params }: { params: { code: string } }) {
  const db = await getDb();
  const catalog = await db.collection("diamond_catalogs").findOne({ code: params.code });

  if (!catalog || catalog.status !== "active") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="text-center px-6">
          <p className="text-gray-500 mt-4">This catalog is not available.</p>
          <p className="text-sm text-gray-400 mt-1">
            The link may be incorrect, or the catalog has been removed.
          </p>
        </div>
      </div>
    );
  }

  // First page (in the same order the viewer's default sort asks for: price,
  // or carat when prices are hidden) and the filter options, together — so
  // the page opens with stones and a ready filter panel, no second round trip.
  const filters = catalog.filters as DiamondFilters;
  const savedSets = (catalog.sets ?? []) as SavedSet[];
  const setStoneIds = savedSets.flatMap((s) => s.stone_ids);
  const [{ rows, total }, facets, setStones] = await Promise.all([
    queryDiamondStock(filters, {
      page: 1,
      pageSize: 40,
      sort: catalog.show_price ? { field: "amount", dir: "asc" } : { field: "carat", dir: "asc" },
      flatMarkupPercent: catalog.flat_markup_percent,
    }),
    getScopedStockFacets(filters),
    setStoneIds.length
      ? queryDiamondStock({ stoneIds: setStoneIds }, { page: 1, pageSize: setStoneIds.length, flatMarkupPercent: catalog.flat_markup_percent })
      : null,
  ]);
  // Public: rate/amount become the sell price (cost + margin). The original
  // stock cost is never attached, so it can't leak into this page's payload.
  const price = catalogPricing(catalog.flat_markup_percent);
  const priced = rows.map((r) => price(r as Record<string, unknown> & PricedRow));

  // Matched sets, in saved order; a stone no longer on hand stays listed as unavailable.
  const byId = new Map((setStones?.rows ?? []).map((r) => [String(r.stone_id), price(r as Record<string, unknown> & PricedRow)]));
  const sets: CatalogSet[] = savedSets.map((s) => ({
    name: s.name,
    stones: s.stone_ids.map((id) => ({ stone_id: id, row: (byId.get(id) ?? null) as unknown as StockRow | null })),
  }));

  return (
    <DiamondCatalogViewer
      code={params.code}
      name={catalog.name}
      showPrice={catalog.show_price}
      showBranding={catalog.show_branding}
      initialRows={priced as unknown as StockRow[]}
      total={total}
      // Location is internal warehouse info — never sent to the public page.
      facets={{ ...facets, locations: [] }}
      sets={sets}
    />
  );
}
