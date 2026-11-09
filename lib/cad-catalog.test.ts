import { describe, expect, it } from "vitest";
import { cadCatalogItemFilter, cadCatalogSettings, validateCadCatalog, type CadCatalogInput } from "@/lib/cad-catalog";

function catalogInput(): CadCatalogInput {
  return {
    name: "Cuban Designs", metals: ["14k"], extra_percent: 0, show_price: true, show_branding: false,
    filters: { categories: ["Bracelet", "Necklace"], datasets: ["luxe"], search: "Cuban", mode: "AND", priceMin: "", priceMax: "" },
    items: ["Bracelet", "Necklace"].map((type, i) => ({
      design_id: `luxe::collection::${type}:CB-${i}`, dataset: "luxe", collection: "collection",
      design_code: `CB-${i}`, design_type: type, cad_url: `https://example.com/${i}.png`, display_order: i,
      prices: { "14k": { price: 120 + i, certifiedSource: null } },
    })),
  };
}

describe("CAD catalog editing data", () => {
  it("records the categories of selected designs independently from browsing filters", () => {
    const input = catalogInput();
    input.filters.categories = ["Ring"];
    const settings = cadCatalogSettings(input);
    expect(settings.name).toBe("Cuban Designs");
    expect(settings.categories).toEqual(["Bracelet", "Necklace"]);
    expect(settings.category).toBe("Bracelet · Necklace");
    expect(settings.filters).toEqual(input.filters);
    expect(settings.show_branding).toBe(false);
    expect(validateCadCatalog(input)).toBeNull();
  });

  it("rejects empty catalogs, duplicate designs and missing metal prices", () => {
    const input = catalogInput();
    expect(validateCadCatalog({ ...input, items: [] })).toMatch(/at least one design/);
    expect(validateCadCatalog({ ...input, items: [input.items[0], input.items[0]] })).toMatch(/unique/);
    expect(validateCadCatalog({ ...input, metals: ["14k", "18k"] })).toMatch(/price for each/);
    expect(validateCadCatalog({ ...input, extra_percent: -1 })).toMatch(/zero or greater/);
  });

  it("reads both legacy catalogs and the current saved revision", () => {
    expect(cadCatalogItemFilter({ _id: "catalog" })).toEqual({ catalog_id: "catalog", item_revision: { $exists: false } });
    expect(cadCatalogItemFilter({ _id: "catalog", item_revision: "latest" })).toEqual({ catalog_id: "catalog", item_revision: "latest" });
  });
});
