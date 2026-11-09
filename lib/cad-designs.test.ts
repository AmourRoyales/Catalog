import { describe, expect, it } from "vitest";
import { searchCadDesigns } from "@/lib/cad-designs";

describe("CAD category search", () => {
  it("returns the union of bracelet and necklace designs across libraries", () => {
    const datasets = ["design", "luxe"] as const;
    const bracelets = searchCadDesigns({ datasets: [...datasets], category: "Bracelet" });
    const necklaces = searchCadDesigns({ datasets: [...datasets], category: "Necklace" });
    const combined = searchCadDesigns({ datasets: [...datasets], categories: ["Bracelet", "Necklace"] });
    expect(bracelets.length).toBeGreaterThan(0);
    expect(necklaces.length).toBeGreaterThan(0);
    expect(new Set(combined.map((d) => d.id))).toEqual(new Set([...bracelets, ...necklaces].map((d) => d.id)));
    expect(combined).toHaveLength(bracelets.length + necklaces.length);
  });

  it("keeps tag filtering when multiple categories are selected", () => {
    const options = { datasets: ["luxe"] as ["luxe"], search: "Round", mode: "AND" as const };
    const combined = searchCadDesigns({ ...options, categories: ["Bracelet", "Necklace"] });
    expect(combined.length).toBeGreaterThan(0);
    expect(combined.every((d) => ["Bracelet", "Necklace"].includes(d.type) && d.tags.some((t) => /round/i.test(t)))).toBe(true);
  });

  it("an empty category selection browses all categories", () => {
    expect(searchCadDesigns({ datasets: ["luxe"], categories: [] })).toEqual(searchCadDesigns({ datasets: ["luxe"] }));
  });
});
