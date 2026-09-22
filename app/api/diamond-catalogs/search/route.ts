import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { queryDiamondStock, type DiamondFilters } from "@/lib/diamond-stock-query";
import { withAdminPricing, type PricedRow } from "@/lib/diamond-pricing";

const PAGE_SIZE = 40;

// Builder-only live preview (auth-gated). The public share link uses a
// separate route (app/api/diamonds/[code]/route.ts) that re-derives filters
// from the saved catalog server-side instead of trusting client input.
//
// Rows get the admin pricing treatment: rate/amount are the sell price
// (cost + margin), plus costRate/costAmount/margin so the builder and "View
// Diamonds" can show the original stock cost alongside the markup.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const filters: DiamondFilters = body.filters ?? {};
  const page = Math.max(1, Number(body.page) || 1);

  const { rows, total } = await queryDiamondStock(filters, { page, pageSize: PAGE_SIZE });
  const priced = rows.map((r) => withAdminPricing(r as Record<string, unknown> & PricedRow));
  return NextResponse.json({ rows: priced, total, page, pageSize: PAGE_SIZE });
}
