import { CAD_CATEGORIES, type CadDataset } from "@/lib/cad-constants";
import { METAL_PURITY_ORDER, type CadQuote, type Purity } from "@/lib/cad-pricing";

export type CadCatalogItem = {
  design_id: string;
  dataset: CadDataset;
  collection: string;
  design_code: string;
  design_type: string;
  cad_url: string;
  display_order: number;
  prices: Partial<Record<Purity, { price: number; breakdown?: CadQuote; certifiedSource: CadQuote["certifiedSource"] }>>;
};

export type CadCatalogFilters = {
  categories: string[];
  datasets: CadDataset[];
  search: string;
  mode: "AND" | "OR";
  priceMin: string;
  priceMax: string;
};

export type CadCatalogInput = {
  name: string;
  metals: Purity[];
  extra_percent: number;
  show_price: boolean;
  show_branding: boolean;
  filters: CadCatalogFilters;
  items: CadCatalogItem[];
};

// Old catalogs have no revision. Only expose the item set the catalog points
// to, so saving an edit cannot show a partly replaced catalog to viewers.
export function cadCatalogItemFilter(catalog: { _id: unknown; item_revision?: string }) {
  return { catalog_id: catalog._id, item_revision: catalog.item_revision ?? { $exists: false } };
}

export function validateCadCatalog(input: CadCatalogInput): string | null {
  if (typeof input?.name !== "string" || !input.name.trim()) return "Catalog name is required.";
  if (!Array.isArray(input.metals) || !input.metals.length || input.metals.some((m) => !METAL_PURITY_ORDER.includes(m))) {
    return "Pick at least one valid metal.";
  }
  if (!Number.isFinite(input.extra_percent) || input.extra_percent < 0) return "Extra percentage must be zero or greater.";
  if (!Array.isArray(input.items) || !input.items.length) return "Add at least one design to the catalog.";
  const ids = new Set<string>();
  for (const item of input.items) {
    if (!item || typeof item.design_id !== "string" || !item.design_id || ids.has(item.design_id)
      || !["design", "luxe"].includes(item.dataset) || typeof item.design_type !== "string"
      || typeof item.design_code !== "string" || typeof item.cad_url !== "string") {
      return "Catalog designs must be valid and unique.";
    }
    ids.add(item.design_id);
    if (input.metals.some((m) => !Number.isFinite(item.prices?.[m]?.price) || item.prices[m]!.price < 0)) {
      return "Every design must have a price for each selected metal. Refresh pricing and try again.";
    }
  }
  return null;
}

export function cadCatalogSettings(input: CadCatalogInput) {
  const categories = Array.from(new Set(input.items.map((item) => item.design_type)));
  const filters = input.filters;
  return {
    name: input.name.trim(),
    metals: Array.from(new Set(input.metals)),
    categories,
    category: categories.join(" · "),
    extra_percent: input.extra_percent,
    show_price: input.show_price !== false,
    show_branding: input.show_branding !== false,
    // Filters are only for browsing in the editor; changing them never
    // removes a design that was already selected from another category.
    filters: filters && {
      categories: Array.isArray(filters.categories) ? filters.categories.filter((c) => CAD_CATEGORIES.includes(c as typeof CAD_CATEGORIES[number])) : [],
      datasets: Array.isArray(filters.datasets) ? filters.datasets.filter((d) => d === "design" || d === "luxe") : ["design", "luxe"],
      search: typeof filters.search === "string" ? filters.search : "",
      mode: filters.mode === "OR" ? "OR" : "AND",
      priceMin: typeof filters.priceMin === "string" ? filters.priceMin : "",
      priceMax: typeof filters.priceMax === "string" ? filters.priceMax : "",
    },
  };
}
