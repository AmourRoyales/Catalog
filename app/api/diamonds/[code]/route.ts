import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { queryDiamondStock, queryDiamondStockScoped, type DiamondFilters } from "@/lib/diamond-stock-query";
import { withPublicPricing, type PricedRow } from "@/lib/diamond-pricing";

const PAGE_SIZE = 40;

async function getActiveCatalog(code: string) {
  const db = await getDb();
  return db.collection("diamond_catalogs").findOne({ code });
}

// Public, unauthenticated — this is what makes a /diamonds/[code] link work
// for pagination beyond the first server-rendered page. Deliberately takes
// only `code` + `page` from the client and always re-derives the filter
// from the saved diamond_catalogs doc itself; it never accepts a filters
// body, so a link can only ever see what its own saved filter matches.
export async function GET(request: Request, { params }: { params: { code: string } }) {
  const catalog = await getActiveCatalog(params.code);
  if (!catalog || catalog.status !== "active") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const page = Math.max(1, Number(new URL(request.url).searchParams.get("page")) || 1);
  const { rows, total } = await queryDiamondStock(catalog.filters as DiamondFilters, { page, pageSize: PAGE_SIZE });
  // Public: sell price only — see app/diamonds/[code]/page.tsx (first page) for why.
  const priced = rows.map((r) => withPublicPricing(r as Record<string, unknown> & PricedRow));
  return NextResponse.json({ rows: priced, total, page, pageSize: PAGE_SIZE });
}

// Public, unauthenticated — powers the visitor-facing filter panel. `filters`
// in the body is whatever the VISITOR picked and is combined ($and) with the
// catalog's own saved filter server-side, so a visitor can only ever narrow
// a catalog, never see anything outside what its own filter already shares.
export async function POST(request: Request, { params }: { params: { code: string } }) {
  const catalog = await getActiveCatalog(params.code);
  if (!catalog || catalog.status !== "active") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  // Location is internal warehouse info — the public panel doesn't offer it
  // (see showLocation on DiamondExplorer), and it's stripped here too in
  // case something still sends it, so the public search can't be used to
  // probe per-location counts.
  const rawFilters = (body.filters ?? {}) as DiamondFilters;
  const visitorFilters: DiamondFilters = { ...rawFilters, locations: undefined, excludeLocations: undefined };
  const page = Math.max(1, Number(body.page) || 1);

  const { rows, total } = await queryDiamondStockScoped(catalog.filters as DiamondFilters, visitorFilters, {
    page,
    pageSize: PAGE_SIZE,
  });
  const priced = rows.map((r) => withPublicPricing(r as Record<string, unknown> & PricedRow));
  return NextResponse.json({ rows: priced, total, page, pageSize: PAGE_SIZE });
}
