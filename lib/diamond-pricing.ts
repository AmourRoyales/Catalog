// Lab-grown diamond base markup pricing.
//
// This is the whole pricing engine for the Diamond Catalog feature: it turns
// a stone's landed (stock) cost into the B2B catalog price customers see.
// It applies to every stone in diamond_stock, regardless of growth type.
//
// This file is pure and import-safe from the client (e.g. StoneDetail.tsx
// reads PRICING_PROFILE directly) — it must never import lib/diamond-stock-
// query.ts or anything else that touches Mongo. The query+pricing bridge
// that needs both lives in lib/diamond-query-and-price.ts instead.

// ---------------------------------------------------------------------
// PRICING_PROFILE — every number below is meant to be edited in place if
// the business rules change. There's deliberately no settings page or DB
// document for this (by request) — change the numbers here and redeploy.
// ---------------------------------------------------------------------
export const PRICING_PROFILE = {
  // Base markup by landed cost (the stone's total cost, not its $/ct rate).
  // Ordered narrowest-first; `max` is exclusive, `null` means "and above".
  costTiers: [
    { max: 100, markupPercent: 45 },
    { max: 250, markupPercent: 35 },
    { max: 500, markupPercent: 30 },
    { max: 1000, markupPercent: 25 },
    { max: 2000, markupPercent: 20 },
    { max: null, markupPercent: 15 },
  ] as { max: number | null; markupPercent: number }[],

  // Percentage-point adjustments layered on top of the base markup. These
  // shift the MARKUP, never the underlying cost — the supplier price may
  // already reflect quality, so color/clarity aren't applied as separate
  // cost multipliers.
  colorAdjustment: { D: 4, E: 3, F: 2, G: 1, H: 0, I: -1 } as Record<string, number>,
  colorAdjustmentBelowI: -2, // "J or lower"

  clarityAdjustment: { FL: 8, IF: 6, VVS1: 4, VVS2: 3, VS1: 1, VS2: 0, SI1: -2 } as Record<string, number>,
  clarityAdjustmentBelowSI1: -3, // "SI2 or lower"

  // Large-stone adjustment, by the individual diamond's own carat weight.
  // Kept small on purpose: the cost tiers above already give expensive
  // stones a lower base % (that's the same "big stone" signal), so this
  // isn't allowed to double up hard enough to erase the floor's protection
  // — see markupFloorPercent.
  largeStoneTiers: [
    { min: 5, adjustmentPercent: -3 },
    { min: 3, adjustmentPercent: -2 },
    { min: 2, adjustmentPercent: -1 },
  ] as { min: number; adjustmentPercent: number }[],

  // Every sale here is a single piece, not a bulk order — a thin percentage
  // on an expensive stone is a thin dollar profit on the whole sale, not
  // something that averages out. 18% keeps that from happening even after
  // the cost-tier's lowest base (15%) and the large-stone adjustment above
  // both apply; well-graded large stones still price above this floor on
  // their own merits (see the color/clarity adjustments).
  markupFloorPercent: 18,
  markupCapPercent: 55,

  minGrossProfitDollars: 25,

  // Market-review guardrail. No comparable-retail-price data source exists
  // yet (nothing in the stock import carries one), so this never fires
  // today — pricing_review_required is always false — but the check is
  // fully wired up and activates the moment a benchmark value is supplied.
  marketCeilingFactor: 0.6,

  // Final catalog price, rounded.
  rounding: [
    { max: 250, nearest: 1 },
    { max: 1000, nearest: 5 },
    { max: null, nearest: 10 },
  ] as { max: number | null; nearest: number }[],
};

export type DiamondPriceBreakdown = {
  landedCost: number;
  baseMarkupPercent: number;
  colorAdjustmentPercent: number;
  clarityAdjustmentPercent: number;
  largeStoneAdjustmentPercent: number;
  rawMarkupPercent: number; // before the floor/cap clamp
  finalMarkupPercent: number; // after the floor/cap clamp
  percentagePrice: number;
  minimumProfitPrice: number;
  preliminaryB2bPrice: number; // max(percentagePrice, minimumProfitPrice), unrounded
  catalogPrice: number; // preliminaryB2bPrice, rounded — the actual sell price
  marketBenchmark: number | null;
  marketCeiling: number | null;
  pricingReviewRequired: boolean;
};

function baseMarkupPercent(landedCost: number): number {
  for (const tier of PRICING_PROFILE.costTiers) {
    if (tier.max == null || landedCost < tier.max) return tier.markupPercent;
  }
  return PRICING_PROFILE.costTiers[PRICING_PROFILE.costTiers.length - 1].markupPercent;
}

// A plain color grade or range ("E", "O-P"). Fancy colors (anything else,
// e.g. "Fancy Vivid Yellow") aren't covered by the spec — treated as
// neutral (0 points) rather than guessed at.
function colorAdjustmentPercent(color: string): number {
  const letters = color
    .trim()
    .toUpperCase()
    .split("-")
    .map((s) => s.trim())
    .filter((s) => /^[A-Z]$/.test(s));
  if (letters.length === 0) return 0; // fancy color, or unrecognized

  // A range's worse grade is whichever letter is further from D (higher char code).
  const worst = letters.reduce((a, b) => (b > a ? b : a));
  // D-I are the only mapped grades; anything else in a valid D-Z scale is "J or lower".
  return worst in PRICING_PROFILE.colorAdjustment ? PRICING_PROFILE.colorAdjustment[worst] : PRICING_PROFILE.colorAdjustmentBelowI;
}

function clarityAdjustmentPercent(clarity: string): number {
  const c = clarity.trim().toUpperCase();
  return c in PRICING_PROFILE.clarityAdjustment
    ? PRICING_PROFILE.clarityAdjustment[c]
    : PRICING_PROFILE.clarityAdjustmentBelowSI1;
}

function largeStoneAdjustmentPercent(carat: number): number {
  for (const tier of PRICING_PROFILE.largeStoneTiers) {
    if (carat >= tier.min) return tier.adjustmentPercent;
  }
  return 0;
}

function clampMarkup(percent: number): number {
  return Math.min(PRICING_PROFILE.markupCapPercent, Math.max(PRICING_PROFILE.markupFloorPercent, percent));
}

function roundCatalogPrice(price: number): number {
  const nearest = PRICING_PROFILE.rounding.find((r) => r.max == null || price < r.max)!.nearest;
  return Math.round(price / nearest) * nearest;
}

/**
 * The whole pricing pipeline for one stone, per the lab-grown diamond base
 * markup rules: base markup by cost tier, +/- color, +/- clarity, +/-
 * large-stone size, clamped to [floor, cap], floored at a flat minimum
 * dollar profit, optionally flagged against a market ceiling, then rounded.
 */
export function priceLabGrownDiamond(input: {
  landedCost: number;
  color: string;
  clarity: string;
  carat: number;
  comparableRetailPrice?: number | null;
}): DiamondPriceBreakdown {
  const { landedCost, color, clarity, carat, comparableRetailPrice } = input;

  const base = baseMarkupPercent(landedCost);
  const colorAdj = colorAdjustmentPercent(color);
  const clarityAdj = clarityAdjustmentPercent(clarity);
  const largeAdj = largeStoneAdjustmentPercent(carat);
  const rawMarkupPercent = base + colorAdj + clarityAdj + largeAdj;
  const finalMarkupPercent = clampMarkup(rawMarkupPercent);

  const percentagePrice = landedCost * (1 + finalMarkupPercent / 100);
  const minimumProfitPrice = landedCost + PRICING_PROFILE.minGrossProfitDollars;
  const preliminaryB2bPrice = Math.max(percentagePrice, minimumProfitPrice);

  let marketCeiling: number | null = null;
  let pricingReviewRequired = false;
  if (comparableRetailPrice != null && comparableRetailPrice > 0) {
    marketCeiling = comparableRetailPrice * PRICING_PROFILE.marketCeilingFactor;
    pricingReviewRequired = preliminaryB2bPrice > marketCeiling;
  }

  return {
    landedCost,
    baseMarkupPercent: base,
    colorAdjustmentPercent: colorAdj,
    clarityAdjustmentPercent: clarityAdj,
    largeStoneAdjustmentPercent: largeAdj,
    rawMarkupPercent,
    finalMarkupPercent,
    percentagePrice,
    minimumProfitPrice,
    preliminaryB2bPrice,
    catalogPrice: roundCatalogPrice(preliminaryB2bPrice),
    marketBenchmark: comparableRetailPrice ?? null,
    marketCeiling,
    pricingReviewRequired,
  };
}

// ---------------------------------------------------------------------
// diamond_stock row pricing — admin vs. public
// ---------------------------------------------------------------------

export type PricedRow = { rate: number; amount: number; carat: number; color: string; clarity: string };

function priceRow(row: PricedRow): DiamondPriceBreakdown {
  return priceLabGrownDiamond({
    landedCost: Number(row.amount),
    color: String(row.color ?? ""),
    clarity: String(row.clarity ?? ""),
    carat: Number(row.carat),
    // No comparable-retail-price data source exists yet — see PRICING_PROFILE.marketCeilingFactor above.
    comparableRetailPrice: null,
  });
}

export type AdminPricingFields = {
  costRate: number;
  costAmount: number;
  baseMarkupPercent: number;
  colorAdjustmentPercent: number;
  clarityAdjustmentPercent: number;
  largeStoneAdjustmentPercent: number;
  finalMarkupPercent: number;
  marginAmount: number;
  pricingReviewRequired: boolean;
  marketCeiling: number | null;
};

/**
 * Admin-facing: keeps the landed cost and the full markup breakdown
 * alongside the catalog (sell) price. rate/amount are overwritten to the
 * catalog price so every list/table that reads them shows the sell price by
 * default; the cost and breakdown are additional fields.
 */
export function withAdminPricing<T extends PricedRow>(row: T): T & AdminPricingFields {
  const p = priceRow(row);
  const carat = Number(row.carat);
  const rate = carat > 0 ? p.catalogPrice / carat : p.catalogPrice;
  return {
    ...row,
    costRate: Number(row.rate),
    costAmount: p.landedCost,
    baseMarkupPercent: p.baseMarkupPercent,
    colorAdjustmentPercent: p.colorAdjustmentPercent,
    clarityAdjustmentPercent: p.clarityAdjustmentPercent,
    largeStoneAdjustmentPercent: p.largeStoneAdjustmentPercent,
    finalMarkupPercent: p.finalMarkupPercent,
    marginAmount: p.catalogPrice - p.landedCost,
    pricingReviewRequired: p.pricingReviewRequired,
    marketCeiling: p.marketCeiling,
    rate,
    amount: p.catalogPrice,
  };
}

/**
 * Public-facing: rate/amount become the catalog price. Landed cost, margin
 * and markup percentage are never computed into this object, so they can't
 * leak into a public response.
 */
export function withPublicPricing<T extends PricedRow>(row: T): T {
  const p = priceRow(row);
  const carat = Number(row.carat);
  const rate = carat > 0 ? p.catalogPrice / carat : p.catalogPrice;
  return { ...row, rate, amount: p.catalogPrice };
}

// ---------------------------------------------------------------------
// Insert-time pricing snapshot
// ---------------------------------------------------------------------

/** Snake_case to match the rest of the diamond_stock document (see lib/cad-stock.ts). */
export type StoredPricingFields = {
  catalog_rate: number;
  catalog_amount: number;
  base_markup_percent: number;
  color_adjustment_percent: number;
  clarity_adjustment_percent: number;
  large_stone_adjustment_percent: number;
  final_markup_percent: number;
  margin_amount: number;
  pricing_review_required: boolean;
};

/**
 * Runs the same pricing engine as withAdminPricing/withPublicPricing, but at
 * import time (lib/cad-stock.ts excelRowToStockRow, via the import route) so
 * the catalog price is recorded on the diamond_stock document itself instead
 * of only ever existing as a read-time calculation. `rate`/`amount` on the
 * document stay the landed cost exactly as imported — untouched here — this
 * only adds the `catalog_*` fields alongside them.
 *
 * The live app still computes the displayed price the same way it always
 * has (from current stock cost + the current PRICING_PROFILE), so a pricing
 * rule change in code takes effect immediately without needing a reimport.
 * This snapshot exists as the recorded book price for the batch as it was
 * priced on import, and as a foundation for a future true database-level
 * price sort/filter (today's sort still fetches and prices matches in
 * memory — see lib/diamond-query-and-price.ts).
 */
export function priceStockRowForStorage(row: PricedRow): StoredPricingFields {
  const p = priceRow(row);
  const carat = Number(row.carat);
  return {
    catalog_rate: carat > 0 ? p.catalogPrice / carat : p.catalogPrice,
    catalog_amount: p.catalogPrice,
    base_markup_percent: p.baseMarkupPercent,
    color_adjustment_percent: p.colorAdjustmentPercent,
    clarity_adjustment_percent: p.clarityAdjustmentPercent,
    large_stone_adjustment_percent: p.largeStoneAdjustmentPercent,
    final_markup_percent: p.finalMarkupPercent,
    margin_amount: p.catalogPrice - p.landedCost,
    pricing_review_required: p.pricingReviewRequired,
  };
}
