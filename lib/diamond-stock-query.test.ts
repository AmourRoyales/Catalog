import { describe, expect, it } from "vitest";
import { buildQuery } from "./diamond-stock-query";

describe("buildQuery", () => {
  it("applies per-shape carat ranges, with caratMin/caratMax for every other shape", () => {
    const q = buildQuery({ caratMin: 1, caratMax: 3, shapeCaratRanges: [{ shape: "ROUND", caratMin: 0.5, caratMax: 3 }] });
    expect(q.carat).toBeUndefined();
    expect(q.$and).toEqual([
      {
        $or: [
          { shape: "ROUND", carat: { $gte: 0.5, $lte: 3 } },
          { shape: { $nin: ["ROUND"] }, carat: { $gte: 1, $lte: 3 } },
        ],
      },
    ]);
  });

  it("filters a flat-markup catalog's price on cost scaled back from the sell price", () => {
    const q = buildQuery({ priceMin: 120, priceMax: 600 }, { flatMarkupPercent: 20 });
    expect(q.catalog_amount).toBeUndefined();
    expect(q.amount.$gte).toBeCloseTo(100);
    expect(q.amount.$lte).toBeCloseTo(500);
  });

  it("limits a hand-picked catalog to its stone IDs", () => {
    expect(buildQuery({ stoneIds: ["A1", "B2"] }).stone_id).toEqual({ $in: ["A1", "B2"] });
  });
});
