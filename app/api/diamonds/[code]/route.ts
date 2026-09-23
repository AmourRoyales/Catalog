import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { parseSort, type DiamondFilters } from "@/lib/diamond-stock-query";
import { withPublicPricing } from "@/lib/diamond-pricing";
import { queryAndPrice } from "@/lib/diamond-query-and-price";

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

  const params2 = new URL(request.url).searchParams;
  const page = Math.max(1, Number(params2.get("page")) || 1);
  const sort = parseSort({ field: params2.get("sortField"), dir: params2.get("sortDir") });
  // Public: sell price only — see app/diamonds/[code]/page.tsx (first page) for why.
  const { rows, total } = await queryAndPrice(withPublicPricing, {
    filters: catalog.filters as DiamondFilters,
    sort,
    page,
    pageSize: PAGE_SIZE,
  });
  return NextResponse.json({ rows, total, page, pageSize: PAGE_SIZE });
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
  // Location and certificate-number search are admin-only (see showLocation
  // / showCertSearch on DiamondExplorer) and stripped here too in case
  // something still sends them, so the public search can't be used to probe
  // per-location counts or look up a specific stone by its report number.
  const rawFilters = (body.filters ?? {}) as DiamondFilters;
  const visitorFilters: DiamondFilters = { ...rawFilters, locations: undefined, excludeLocations: undefined, reportNo: undefined };
  const page = Math.max(1, Number(body.page) || 1);
  const sort = parseSort(body.sort);

  const { rows, total } = await queryAndPrice(withPublicPricing, {
    filters: visitorFilters,
    scopedTo: catalog.filters as DiamondFilters,
    sort,
    page,
    pageSize: PAGE_SIZE,
  });
  return NextResponse.json({ rows, total, page, pageSize: PAGE_SIZE });
}
