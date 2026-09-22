import { getDb } from "@/lib/mongo";
import { queryDiamondStock, type DiamondFilters } from "@/lib/diamond-stock-query";
import { withPublicPricing, type PricedRow } from "@/lib/diamond-pricing";
import DiamondCatalogViewer, { type StockRow } from "./viewer";

export default async function PublicDiamondCatalogPage({ params }: { params: { code: string } }) {
  const db = await getDb();
  const catalog = await db.collection("diamond_catalogs").findOne({ code: params.code });

  if (!catalog || catalog.status !== "active") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F8FB]">
        <div className="text-center px-6">
          <p className="text-gray-500 mt-4">This catalog is not available.</p>
          <p className="text-sm text-gray-400 mt-1">
            The link may be incorrect, or the catalog has been removed.
          </p>
        </div>
      </div>
    );
  }

  const { rows, total } = await queryDiamondStock(catalog.filters as DiamondFilters, { page: 1, pageSize: 40 });
  // Public: rate/amount become the sell price (cost + margin). The original
  // stock cost is never attached, so it can't leak into this page's payload.
  const priced = rows.map((r) => withPublicPricing(r as Record<string, unknown> & PricedRow));

  return (
    <DiamondCatalogViewer
      code={params.code}
      name={catalog.name}
      showPrice={catalog.show_price}
      showBranding={catalog.show_branding}
      initialRows={priced as unknown as StockRow[]}
      total={total}
    />
  );
}
