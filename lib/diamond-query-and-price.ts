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

// A carat sort is a real indexed DB field — MongoDB sorts and paginates it
// directly, cheaply, at any stock size. A price sort can't work that way:
// the displayed price is cost + a markup that varies per stone by color,
// clarity and carat (see PRICING_PROFILE), so the DB's raw `amount` column
// is only approximately in the same order as the computed sell price —
// close, but with small adjacent swaps that would look like a bug in a
// "Price: Low to High" sort. So for a price sort, every matching stone is
// fetched, priced, and sorted here in memory, then the page is sliced —
// affordable at this stock's actual size (five figures, comfortably under
// the cap below), and always exactly right.
const PRICE_SORT_FETCH_CAP = 50000;

/** Runs a diamond_stock query and prices every row with `price`, honoring `sort` exactly regardless of field. */
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
  const run = (queryOpts: { page: number; pageSize: number; sort?: DiamondSort }) =>
    opts.scopedTo
      ? queryDiamondStockScoped(opts.scopedTo, opts.filters, queryOpts)
      : queryDiamondStock(opts.filters, queryOpts);

  if (opts.sort.field !== "amount") {
    const { rows, total } = await run({ page: opts.page, pageSize: opts.pageSize, sort: opts.sort });
    return { rows: rows.map((r) => price(r as Record<string, unknown> & PricedRow)), total };
  }

  const { rows: allRaw, total } = await run({ page: 1, pageSize: PRICE_SORT_FETCH_CAP });
  const priced = allRaw.map((r) => price(r as Record<string, unknown> & PricedRow));
  priced.sort((a, b) => (opts.sort.dir === "asc" ? a.amount - b.amount : b.amount - a.amount));
  const start = (opts.page - 1) * opts.pageSize;
  return { rows: priced.slice(start, start + opts.pageSize), total };
}
