// Client-safe constants for the Diamond Catalog filter UI. No DB
// client import here — those stay server-only in lib/diamond-stock-query.ts.
import type { DiamondFilters } from "@/lib/diamond-stock-query";

export type { DiamondFilters };

export const CARAT_PRESETS: { label: string; min: number; max?: number }[] = [
  { label: "0.30-0.39", min: 0.3, max: 0.39 },
  { label: "0.40-0.49", min: 0.4, max: 0.49 },
  { label: "0.50-0.69", min: 0.5, max: 0.69 },
  { label: "0.70-0.89", min: 0.7, max: 0.89 },
  { label: "0.90-0.99", min: 0.9, max: 0.99 },
  { label: "1.00-1.49", min: 1.0, max: 1.49 },
  { label: "1.50-1.99", min: 1.5, max: 1.99 },
  { label: "2.00-2.99", min: 2.0, max: 2.99 },
  { label: "3.00-3.99", min: 3.0, max: 3.99 },
  { label: "4.00-4.99", min: 4.0, max: 4.99 },
  { label: "5.00-5.99", min: 5.0, max: 5.99 },
  { label: "6.00-7.99", min: 6.0, max: 7.99 },
  { label: "8.00-9.99", min: 8.0, max: 9.99 },
  { label: "10+", min: 10 },
];

export const CUT_GRADE_LABEL: Record<string, string> = {
  ID: "Ideal", EX: "Excellent", VG: "Very Good", GD: "Good", FR: "Fair", PR: "Poor", "-": "Not graded",
};
export const FLUORESCENCE_LABEL: Record<string, string> = {
  NON: "None", SL: "Slight", VSL: "Very Slight", STG: "Strong",
};
export const GROWTH_TYPE_OPTIONS = ["CVD", "HPHT", "Other"];

// White tab: the full canonical D-Z grade scale, always offered regardless
// of which grades current stock happens to have (unlike every other filter
// chip list, which is grounded in real stock via facets) — this one is a
// fixed picker, same as the reference tool.
export const WHITE_COLOR_GRADES = [
  "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
];
