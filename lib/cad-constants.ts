// Client-safe constants for the CAD catalog feature — no data/*.json import
// here on purpose, so client components can pull these in without bundling
// the 12MB design library. lib/cad-designs.ts (server-only) re-exports these.
export const CAD_CATEGORIES = ["Ring", "Earring", "Pendant", "Necklace", "Bracelet"] as const;
export type CadCategory = (typeof CAD_CATEGORIES)[number];

export type CadDataset = "design" | "luxe";
export const CAD_DATASET_LABEL: Record<CadDataset, string> = {
  design: "Design library",
  luxe: "Luxe library",
};
