// Hand-off from Design Finder to the CAD catalog builder. Kept in
// sessionStorage (not the URL) because a hand-picked selection can be
// hundreds of design ids long.
import type { CadDataset } from "@/lib/cad-constants";

export const CAD_PREFILL_KEY = "cad-catalog-prefill";

export type CadPrefill = {
  category: string; // "" = all categories
  datasets: CadDataset[];
  search: string;
  mode: "AND" | "OR";
  ids?: string[]; // when set, these exact designs are pre-added to the catalog
};
