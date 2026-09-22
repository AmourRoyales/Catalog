// Server-only access to the CAD design library. Never import this from a
// "use client" file — data/gemini_tags.json (~3.7MB) and data/luxe_CAD.json
// (~8.2MB) would ship straight to the browser. The catalog builder reaches
// this only through app/api/cad-catalogs/search/route.ts, which returns a
// small paginated, already-priced slice.
import geminiTags from "@/data/gemini_tags.json";
import luxeCad from "@/data/luxe_CAD.json";
import { type CadDataset } from "@/lib/cad-constants";

export { CAD_CATEGORIES, type CadCategory, type CadDataset, CAD_DATASET_LABEL } from "@/lib/cad-constants";

type RawDesignEntry = { tags?: string[]; path?: string; CAD_URL?: string | null };
type RawDataset = Record<string, Record<string, RawDesignEntry>>;

export type CadDesign = {
  id: string; // `${dataset}::${collection}::${key}`
  dataset: CadDataset;
  collection: string;
  code: string;
  type: string;
  tags: string[];
  cadUrl: string;
};

const DATASETS: Record<CadDataset, RawDataset> = {
  design: geminiTags as unknown as RawDataset,
  luxe: luxeCad as unknown as RawDataset,
};

// Designs whose code starts with one of these (letters before the number,
// e.g. "MR-001") get a "Men's" tag on top of whatever the library carries.
// Applied here at load time rather than written into data/*.json so it
// survives re-exporting those files from CAD Tools.
const MENS_CODE_PREFIXES = ["MR"];
const MENS_TAG = "Men's";

function withMensTag(code: string, tags: string[]): string[] {
  const prefix = code.match(/^[A-Za-z]+/)?.[0].toUpperCase();
  if (!prefix || !MENS_CODE_PREFIXES.includes(prefix)) return tags;
  return tags.some((t) => t.toLowerCase() === MENS_TAG.toLowerCase()) ? tags : [...tags, MENS_TAG];
}

let cache: Partial<Record<CadDataset, CadDesign[]>> = {};

/**
 * Flattens the nested collection JSON into a flat array, dropping any
 * "design" (gemini_tags.json) entry with no public CAD_URL — those only
 * resolve to a local file path on this machine, so a shared catalog link
 * couldn't show their image. "luxe" entries all carry a CAD_URL already.
 */
export function getAllCadDesigns(dataset: CadDataset): CadDesign[] {
  const cached = cache[dataset];
  if (cached) return cached;

  const data = DATASETS[dataset];
  const designs: CadDesign[] = [];

  for (const [collection, items] of Object.entries(data)) {
    for (const [key, entry] of Object.entries(items)) {
      if (!entry.CAD_URL) continue;
      const [type, code] = key.split(":");
      designs.push({
        id: `${dataset}::${collection}::${key}`,
        dataset,
        collection,
        code: code || key,
        type,
        tags: withMensTag(code || key, entry.tags || []),
        cadUrl: entry.CAD_URL,
      });
    }
  }

  cache[dataset] = designs;
  return designs;
}

export function getCadDesignById(id: string): CadDesign | null {
  const [dataset, collection, key] = id.split("::");
  if (dataset !== "design" && dataset !== "luxe") return null;
  const entry = DATASETS[dataset]?.[collection]?.[key];
  if (!entry || !entry.CAD_URL) return null;
  const [type, code] = key.split(":");
  return {
    id, dataset, collection, code: code || key, type,
    tags: withMensTag(code || key, entry.tags || []), cadUrl: entry.CAD_URL,
  };
}

// Matches a "Size IND <n>" / "Size US <n>" tag anywhere in a (possibly
// longer) tag string, e.g. "0.25ct Round Solitaire Ring in Size US 7.25".
const RING_SIZE_TAG_RE = /size\s+(ind|us)\s+([\d.]+)/i;
// A bare ring-size search term, e.g. "US 7", "ind 14", "size us 7.5".
const RING_SIZE_TERM_RE = /^(?:size\s+)?(ind|us)\s*([\d.]+)$/i;
// Source tags carry small rounding noise ("IND 13" vs "IND 13.05").
const RING_SIZE_TOLERANCE = 0.15;

/** Indian size is approximately 2x the US size. */
const convertRingSize = (unit: "US" | "IND", value: number) => (unit === "US" ? value * 2 : value / 2);

function tagsMatchRingSize(tags: string[], indicator: string, value: number): boolean {
  const unit = indicator.toUpperCase() as "US" | "IND";
  const converted = convertRingSize(unit, value);
  return tags.some((tag) => {
    const m = tag.match(RING_SIZE_TAG_RE);
    if (!m) return false;
    const tagUnit = m[1].toUpperCase();
    const target = tagUnit === unit ? value : converted;
    return Math.abs(parseFloat(m[2]) - target) < RING_SIZE_TOLERANCE;
  });
}

function tagsMatchTerm(tags: string[], term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;

  const size = needle.match(RING_SIZE_TERM_RE);
  if (size) {
    const value = parseFloat(size[2]);
    if (!Number.isNaN(value)) return tagsMatchRingSize(tags, size[1], value);
  }
  return tags.some((tag) => tag.toLowerCase().includes(needle));
}

export type SearchMode = "AND" | "OR";

/**
 * Same query language as the CAD Tools Design Finder: comma-separated terms
 * combined by `mode`; a term containing the whole word "OR" is an inner
 * any-of group (e.g. "2mm Each Round OR 0.2ct Each Princess, Tennis").
 */
export function parseSearchQuery(query: string): string[][] {
  return query
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(/\bor\b/i).map((p) => p.trim()).filter(Boolean));
}

export function searchCadDesigns(opts: {
  category?: string;
  datasets: CadDataset[];
  search?: string;
  mode?: SearchMode;
}): CadDesign[] {
  const groups = parseSearchQuery(opts.search || "");
  const all = opts.datasets.flatMap((d) => getAllCadDesigns(d));

  return all.filter((design) => {
    if (opts.category && design.type !== opts.category) return false;
    if (groups.length === 0) return true;
    const results = groups.map((phrases) => phrases.some((p) => tagsMatchTerm(design.tags, p)));
    return opts.mode === "OR" ? results.some(Boolean) : results.every(Boolean);
  });
}
