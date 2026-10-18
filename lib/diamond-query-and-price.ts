// Server-only. Bridges the query layer (lib/diamond-stock-query.ts, which
// talks to Mongo) and the pricing layer (lib/diamond-pricing.ts, which is
// pure and also imported by client components like StoneDetail). Keeping
// this bridge in its own file — rather than folding it into
// diamond-pricing.ts — matters: diamond-pricing.ts must stay import-safe
// for the browser, and pulling the query module (which drags in the
// MongoDB driver, e.g. Node's `net`) into it breaks the client bundle.
// Only import this file from server code (API routes).
import { queryDiamondStock, queryDiamondStockScoped, type DiamondFilters, type DiamondSort } from "@/lib/diamond-stock-query";
import type { PricedRow } from "@/lib/diamond-pricing";

// Both sorts — carat and price — run in MongoDB: the price sort uses each
// doc's stored catalog_amount, which lib/diamond-stock-query.ts
// ensureStockReady keeps in step with the current PRICING_PROFILE, so it is
// in exactly the order of the price `price` computes for display.

/** Runs a diamond_stock query and prices every row on the returned page with `price`. */
export async function queryAndPrice<T extends PricedRow>(
  price: (row: Record<string, unknown> & PricedRow) => T,
  opts: {
    filters: DiamondFilters;
    /** When set, queries via queryDiamondStockScoped(scopedTo, filters, ...) — a public catalog link narrowing its own saved filter. */
    scopedTo?: DiamondFilters;
    sort: DiamondSort;
    page: number;
    pageSize: number;
  }
): Promise<{ rows: T[]; total: number }> {
  const queryOpts = { page: opts.page, pageSize: opts.pageSize, sort: opts.sort };
  const { rows, total } = opts.scopedTo
    ? await queryDiamondStockScoped(opts.scopedTo, opts.filters, queryOpts)
    : await queryDiamondStock(opts.filters, queryOpts);
  return { rows: rows.map((r) => price(r as Record<string, unknown> & PricedRow)), total };
}
