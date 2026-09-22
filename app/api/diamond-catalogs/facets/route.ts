import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getStockFacets } from "@/lib/diamond-stock-query";

// Distinct filter values actually present in current stock (with counts) —
// powers the builder's filter chips so they never offer an option that
// matches nothing.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const facets = await getStockFacets();
  return NextResponse.json(facets);
}
