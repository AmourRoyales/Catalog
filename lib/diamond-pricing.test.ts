import { describe, expect, it } from "vitest";
import { priceLabGrownDiamond, withAdminPricing, withPublicPricing, PRICING_PROFILE } from "./diamond-pricing";

// A "neutral" stone: H color, VS2 clarity, under 2ct — every adjustment is
// 0, so the base markup tier is what's under test with nothing else moving.
const neutral = (landedCost: number, carat = 1) =>
  priceLabGrownDiamond({ landedCost, color: "H", clarity: "VS2", carat });

describe("base markup — cost tiers (neutral color/clarity/size)", () => {
  it.each([
    [50, 45],
    [99.99, 45],
    [100, 35],
    [249.99, 35],
    [250, 30],
    [499.99, 30],
    [500, 25],
    [999.99, 25],
    [1000, 20],
    [1999.99, 20],
    [2000, 15],
    [50000, 15],
  ])("landed cost $%s -> base markup %s%%", (cost, expectedPercent) => {
    expect(neutral(cost).baseMarkupPercent).toBe(expectedPercent);
  });
});

describe("color adjustment (H clarity=VS2, cost=$1000 so base=20%, no clamp)", () => {
  it.each([
    ["D", 4],
    ["E", 3],
    ["F", 2],
    ["G", 1],
    ["H", 0],
    ["I", -1],
    ["J", -2],
    ["K", -2],
    ["Z", -2],
    ["O-P", -2], // range, worse grade wins
  ])("color %s -> %s pts", (color, expectedAdjustment) => {
    const p = priceLabGrownDiamond({ landedCost: 1000, color, clarity: "VS2", carat: 1 });
    expect(p.colorAdjustmentPercent).toBe(expectedAdjustment);
    expect(p.finalMarkupPercent).toBe(20 + expectedAdjustment);
  });

  it("a range picks the worse of the two grades regardless of order", () => {
    const a = priceLabGrownDiamond({ landedCost: 1000, color: "O-P", clarity: "VS2", carat: 1 });
    const b = priceLabGrownDiamond({ landedCost: 1000, color: "P-O", clarity: "VS2", carat: 1 });
    expect(a.colorAdjustmentPercent).toBe(-2);
    expect(b.colorAdjustmentPercent).toBe(-2);
  });

  it("a fancy color (not a plain D-Z grade) is treated as neutral", () => {
    const p = priceLabGrownDiamond({ landedCost: 1000, color: "Fancy Vivid Yellow", clarity: "VS2", carat: 1 });
    expect(p.colorAdjustmentPercent).toBe(0);
  });
});

describe("clarity adjustment (H color, cost=$1000 so base=20%, no clamp)", () => {
  it.each([
    ["FL", 8],
    ["IF", 6],
    ["VVS1", 4],
    ["VVS2", 3],
    ["VS1", 1],
    ["VS2", 0],
    ["SI1", -2],
    ["SI2", -3],
    ["SI3", -3],
    ["I1", -3],
    ["I2", -3],
    ["I3", -3],
  ])("clarity %s -> %s pts", (clarity, expectedAdjustment) => {
    const p = priceLabGrownDiamond({ landedCost: 1000, color: "H", clarity, carat: 1 });
    expect(p.clarityAdjustmentPercent).toBe(expectedAdjustment);
    expect(p.finalMarkupPercent).toBe(20 + expectedAdjustment);
  });
});

describe("large-stone adjustment (H/VS2, cost=$1000 so base=20%, no clamp)", () => {
  it.each([
    [1.99, 0],
    [2.0, -2],
    [2.99, -2],
    [3.0, -4],
    [4.99, -4],
    [5.0, -5],
    [10, -5],
  ])("%sct -> %s pts", (carat, expectedAdjustment) => {
    const p = priceLabGrownDiamond({ landedCost: 1000, color: "H", clarity: "VS2", carat });
    expect(p.largeStoneAdjustmentPercent).toBe(expectedAdjustment);
    expect(p.finalMarkupPercent).toBe(20 + expectedAdjustment);
  });
});

describe("markup floor and cap", () => {
  it("clamps down to the 12% floor when adjustments would push it lower", () => {
    // base 15% (cost>=2000) + I(-1) + SI2 or lower(-3) + 5ct+(-5) = 6%, well under the floor.
    const p = priceLabGrownDiamond({ landedCost: 5000, color: "I", clarity: "I3", carat: 6 });
    expect(p.rawMarkupPercent).toBe(6);
    expect(p.finalMarkupPercent).toBe(PRICING_PROFILE.markupFloorPercent);
  });

  it("clamps up to the 55% cap when adjustments would push it higher", () => {
    // base 45% (cost<100) + D(4) + FL(8) + <2ct(0) = 57%, over the cap.
    const p = priceLabGrownDiamond({ landedCost: 50, color: "D", clarity: "FL", carat: 0.3 });
    expect(p.rawMarkupPercent).toBe(57);
    expect(p.finalMarkupPercent).toBe(PRICING_PROFILE.markupCapPercent);
  });

  it("does not clamp a markup already inside the range", () => {
    const p = priceLabGrownDiamond({ landedCost: 1000, color: "H", clarity: "VS2", carat: 1 });
    expect(p.rawMarkupPercent).toBe(p.finalMarkupPercent);
  });
});

describe("minimum $25 gross profit floor", () => {
  it("wins over the percentage price for a very cheap stone", () => {
    // cost=$10, 45% markup -> percentage price $14.50, but min profit is $10+$25=$35.
    const p = priceLabGrownDiamond({ landedCost: 10, color: "H", clarity: "VS2", carat: 0.05 });
    expect(p.percentagePrice).toBeCloseTo(14.5, 5);
    expect(p.minimumProfitPrice).toBe(35);
    expect(p.preliminaryB2bPrice).toBe(35);
  });

  it("loses to the percentage price once the stone is expensive enough", () => {
    const p = priceLabGrownDiamond({ landedCost: 1000, color: "H", clarity: "VS2", carat: 1 });
    expect(p.percentagePrice).toBeGreaterThan(p.minimumProfitPrice);
    expect(p.preliminaryB2bPrice).toBe(p.percentagePrice);
  });
});

describe("rounding", () => {
  it("rounds to the nearest $1 under $250", () => {
    // cost=$150 (35% base) -> percentage price 202.50 -> preliminary 202.50 -> round to $1 -> 203 (round-half-up).
    const p = priceLabGrownDiamond({ landedCost: 150, color: "H", clarity: "VS2", carat: 0.5 });
    expect(p.preliminaryB2bPrice).toBeCloseTo(202.5, 5);
    expect(p.catalogPrice).toBe(203);
  });

  it("rounds to the nearest $5 from $250 up to $999", () => {
    // cost=$400 (30% base) -> 520 -> nearest $5 -> 520.
    const p = priceLabGrownDiamond({ landedCost: 400, color: "H", clarity: "VS2", carat: 1 });
    expect(p.preliminaryB2bPrice).toBe(520);
    expect(p.catalogPrice).toBe(520);

    // cost=$402 -> 522.6 -> nearest $5 -> 525.
    const p2 = priceLabGrownDiamond({ landedCost: 402, color: "H", clarity: "VS2", carat: 1 });
    expect(p2.preliminaryB2bPrice).toBeCloseTo(522.6, 5);
    expect(p2.catalogPrice).toBe(525);
  });

  it("rounds to the nearest $10 at $1,000 and above", () => {
    // cost=$2000 (15% base, carat<2 so no large-stone adjustment) -> 2300 -> already a multiple of 10.
    const p = priceLabGrownDiamond({ landedCost: 2000, color: "H", clarity: "VS2", carat: 1 });
    expect(p.preliminaryB2bPrice).toBe(2300);
    expect(p.catalogPrice).toBe(2300);

    // cost=$2003 -> 2303.45 -> nearest $10 -> 2300.
    const p2 = priceLabGrownDiamond({ landedCost: 2003, color: "H", clarity: "VS2", carat: 1 });
    expect(p2.catalogPrice).toBe(2300);
  });
});

describe("market-review guardrail", () => {
  it("stays false and null when no benchmark is supplied (no data source exists yet)", () => {
    const p = priceLabGrownDiamond({ landedCost: 1000, color: "H", clarity: "VS2", carat: 1 });
    expect(p.marketBenchmark).toBeNull();
    expect(p.marketCeiling).toBeNull();
    expect(p.pricingReviewRequired).toBe(false);
  });

  it("flags for review when the preliminary price exceeds 60% of the benchmark", () => {
    // preliminary = $1200 (1000 * 1.20); ceiling = 1500*0.6 = 900 -> over.
    const p = priceLabGrownDiamond({ landedCost: 1000, color: "H", clarity: "VS2", carat: 1, comparableRetailPrice: 1500 });
    expect(p.marketBenchmark).toBe(1500);
    expect(p.marketCeiling).toBe(900);
    expect(p.pricingReviewRequired).toBe(true);
  });

  it("does not flag when the preliminary price is at or under the ceiling", () => {
    // preliminary = $1200; ceiling = 2100*0.6 = 1260 -> under.
    const p = priceLabGrownDiamond({ landedCost: 1000, color: "H", clarity: "VS2", carat: 1, comparableRetailPrice: 2100 });
    expect(p.marketCeiling).toBe(1260);
    expect(p.pricingReviewRequired).toBe(false);
  });

  it("ignores a zero or negative benchmark instead of dividing by it", () => {
    const p = priceLabGrownDiamond({ landedCost: 1000, color: "H", clarity: "VS2", carat: 1, comparableRetailPrice: 0 });
    expect(p.marketCeiling).toBeNull();
    expect(p.pricingReviewRequired).toBe(false);
  });
});

describe("color/clarity never touch the underlying cost", () => {
  it("landedCost passes through unchanged regardless of grade", () => {
    const cheap = priceLabGrownDiamond({ landedCost: 1000, color: "D", clarity: "FL", carat: 0.5 });
    const poor = priceLabGrownDiamond({ landedCost: 1000, color: "M", clarity: "I3", carat: 0.5 });
    expect(cheap.landedCost).toBe(1000);
    expect(poor.landedCost).toBe(1000);
    // Only the markup percentage should differ, not the cost basis.
    expect(cheap.landedCost).toBe(poor.landedCost);
    expect(cheap.finalMarkupPercent).not.toBe(poor.finalMarkupPercent);
  });
});

describe("row-level pricing: admin vs. public", () => {
  const row = { rate: 1000, amount: 1000, carat: 1, color: "H", clarity: "VS2" };

  it("admin rows carry the landed cost and the full breakdown, with rate/amount as the catalog (sell) price", () => {
    const admin = withAdminPricing(row);
    expect(admin.costAmount).toBe(1000);
    expect(admin.costRate).toBe(1000);
    expect(admin.baseMarkupPercent).toBe(20);
    expect(admin.finalMarkupPercent).toBe(20);
    expect(admin.amount).toBe(1200); // 1000 * 1.20, already a multiple of 10
    expect(admin.rate).toBe(1200); // carat = 1
    expect(admin.marginAmount).toBe(200);
  });

  it("public rows expose only rate/amount as the catalog price — no cost, margin, or markup fields", () => {
    const pub = withPublicPricing(row);
    expect(pub.amount).toBe(1200);
    expect(pub.rate).toBe(1200);
    expect(pub).not.toHaveProperty("costAmount");
    expect(pub).not.toHaveProperty("costRate");
    expect(pub).not.toHaveProperty("baseMarkupPercent");
    expect(pub).not.toHaveProperty("marginAmount");
    expect(pub).not.toHaveProperty("pricingReviewRequired");
  });

  it("falls back to the catalog price itself for the $/ct rate when carat is 0 (avoids dividing by zero)", () => {
    const zeroCarat = { rate: 100, amount: 100, carat: 0, color: "H", clarity: "VS2" };
    const admin = withAdminPricing(zeroCarat);
    expect(admin.rate).toBe(admin.amount);
    expect(Number.isFinite(admin.rate)).toBe(true);
  });
});
