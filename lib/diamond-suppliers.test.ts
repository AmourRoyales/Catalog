import { describe, expect, it } from "vitest";
import { isBetterCopy, uniqueByCert } from "./diamond-suppliers";

describe("isBetterCopy", () => {
  it("prefers an available stone over a held one, even if pricier", () => {
    expect(isBetterCopy({ stone_stage: "OH", amount: 200 }, { stone_stage: "HOLD", amount: 100 })).toBe(true);
    expect(isBetterCopy({ stone_stage: "HOLD", amount: 100 }, { stone_stage: "OH", amount: 200 })).toBe(false);
  });
  it("then prefers the lower cost; a tie keeps the existing copy", () => {
    expect(isBetterCopy({ stone_stage: "OH", amount: 90 }, { stone_stage: "OH", amount: 100 })).toBe(true);
    expect(isBetterCopy({ stone_stage: "OH", amount: 100 }, { stone_stage: "OH", amount: 100 })).toBe(false);
  });
});

describe("uniqueByCert", () => {
  it("keeps the best copy per certificate and every row without one", () => {
    const { rows, dropped } = uniqueByCert([
      { id: 1, cert_key: "111", stone_stage: "OH", amount: 100 },
      { id: 2, cert_key: "111", stone_stage: "OH", amount: 80 },
      { id: 3, cert_key: null, stone_stage: "OH", amount: 50 },
      { id: 4, cert_key: null, stone_stage: "OH", amount: 50 },
    ]);
    expect(rows.map((r) => r.id).sort()).toEqual([2, 3, 4]);
    expect(dropped).toBe(1);
  });
});
