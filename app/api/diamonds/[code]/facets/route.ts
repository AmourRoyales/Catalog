import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { getScopedStockFacets, type DiamondFilters } from "@/lib/diamond-stock-query";

// Public, unauthenticated. Facet counts scoped to the catalog's own saved
// filter, so a visitor's filter panel only ever offers options within what
// this link already shares — never the full live inventory.
export async function GET(request: Request, { params }: { params: { code: string } }) {
  const db = await getDb();
  const catalog = await db.collection("diamond_catalogs").findOne({ code: params.code });

  if (!catalog || catalog.status !== "active") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const facets = await getScopedStockFacets(catalog.filters as DiamondFilters);
  // Location is internal warehouse info — never sent to the public viewer,
  // which also hides the filter itself (see DiamondExplorer showLocation).
  const publicFacets = { ...facets, locations: [] };

  // Facets only change when stock is re-imported, not per visitor, so a
  // short shared cache keeps repeat views of a popular link off the DB.
  return NextResponse.json(publicFacets, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
