// Server-only. Shared query builder for diamond_stock — used by both the
// authenticated builder's live preview and the public /diamonds/[code] page
// (which re-runs the saved filter against CURRENT stock on every view, per
// the "live filtered link" design). diamond_stock is only reachable through
// this module — callers must do their own auth checks.
import type { Filter } from "mongodb";
import { getDb, serialize } from "@/lib/mongo";

export type DiamondFilters = {
  /** IGI/GIA/etc. certificate (report) number — free-text, partial match. Admin-only: never exposed on the public catalog UI or accepted from public filter input. */
  reportNo?: string;
  shapes?: string[];
  caratMin?: number;
  caratMax?: number;
  colorMode?: "white" | "fancy"; // omitted = both
  colors?: string[]; // White tab: literal grade letters ("D", "E", ... or a range like "O-P")
  fancyHues?: string[]; // Fancy tab: dominant hue family ("Yellow", "Pink", ...), matched via the fancy_hue derived column
  noBgm?: boolean;
  withMedia?: boolean; // only stones that have an image or video link
  clarities?: string[];
  eyeClean?: boolean;
  cuts?: string[];
  polishes?: string[];
  symms?: string[];
  fluorescences?: string[];
  labs?: string[];
  priceMode?: "total" | "per_ct"; // which of priceMin/priceMax applies to
  priceMin?: number;
  priceMax?: number;
  locations?: string[];
  excludeLocations?: boolean;
  growthTypes?: string[];
  depthPctMin?: number;
  depthPctMax?: number;
  tablePctMin?: number;
  tablePctMax?: number;
  ratioMin?: number;
  ratioMax?: number;
  lengthMin?: number;
  lengthMax?: number;
  widthMin?: number;
  widthMax?: number;
  depthMmMin?: number;
  depthMmMax?: number;
};

// Fields shown to anyone with a share link — deliberately excludes internal
// bookkeeping (batch_id, imported_at, cert_stage/price_stage/stone_stage,
// comments, extra, milky — Milky is constant across all stock, no signal).
export const PUBLIC_STOCK_COLUMNS = [
  "stone_id", "shape", "carat", "color", "clarity",
  "cut", "polish", "symm", "fls", "cert", "rate", "amount", "measurement",
  "length_mm", "width_mm", "depth_mm", "table_pct", "depth_pct", "ratio", "ca", "ch", "pa", "ph",
  "girdle", "culet", "shade", "eye_clean", "growth_type", "location",
  "report_no", "image_link", "video_link", "cert_link",
];
const PUBLIC_PROJECTION = Object.fromEntries(PUBLIC_STOCK_COLUMNS.map((c) => [c, 1]));

const WHITE_GRADE_REGEX = "^[D-Za-z](-[D-Za-z])?$";

const INTENSITY_WORDS = new Set(["FANCY", "VIVID", "INTENSE", "DEEP", "DARK", "LIGHT", "FAINT", "VERY"]);
const isWhiteGrade = (c: string) => /^[D-Z](-[D-Z])?$/i.test(c.trim());
function dominantHue(c: string): string | null {
  const w = c.trim().toUpperCase().split(/\s+/).filter((x) => !INTENSITY_WORDS.has(x));
  const last = w[w.length - 1];
  return last ? last.charAt(0) + last.slice(1).toLowerCase() : null;
}

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function buildQuery(filters: DiamondFilters): Filter<any> {
  // Always-on: only stones actually on hand (excludes the 'TRF' — transferred
  // out — rows, which aren't available stock).
  const q: Record<string, any> = { stone_stage: "OH" };
  const and: Record<string, any>[] = [];

  if (filters.reportNo?.trim()) q.report_no = { $regex: escapeRegex(filters.reportNo.trim()), $options: "i" };

  if (filters.shapes?.length) q.shape = { $in: filters.shapes };
  if (filters.caratMin != null || filters.caratMax != null) {
    q.carat = {
      ...(filters.caratMin != null ? { $gte: filters.caratMin } : {}),
      ...(filters.caratMax != null ? { $lte: filters.caratMax } : {}),
    };
  }

  // Filters the Color column itself. White = plain D-Z grades / ranges like
  // "O-P". Fancy = everything else, matched by DOMINANT hue = the LAST word,
  // so "Yellow" matches "Fancy Vivid Yellow" / "Light Yellow" but not
  // "Fancy Yellowish Green".
  if (filters.colorMode === "white") {
    q.color = filters.colors?.length ? { $in: filters.colors } : { $regex: WHITE_GRADE_REGEX };
  } else if (filters.colorMode === "fancy") {
    if (filters.fancyHues?.length) {
      and.push({ $or: filters.fancyHues.map((h) => ({ color: { $regex: `\\s${escapeRegex(h)}$`, $options: "i" } })) });
    } else {
      and.push({ color: { $not: new RegExp(WHITE_GRADE_REGEX) } });
      and.push({ color: { $ne: null } });
    }
  }
  if (filters.noBgm) q.shade = "NO BGM";
  if (filters.withMedia) {
    and.push({ $or: [{ image_link: { $nin: [null, ""] } }, { video_link: { $nin: [null, ""] } }] });
  }

  if (filters.clarities?.length) q.clarity = { $in: filters.clarities };
  if (filters.eyeClean) q.eye_clean = "YES";

  if (filters.cuts?.length) q.cut = { $in: filters.cuts };
  if (filters.polishes?.length) q.polish = { $in: filters.polishes };
  if (filters.symms?.length) q.symm = { $in: filters.symms };
  if (filters.fluorescences?.length) q.fls = { $in: filters.fluorescences };
  if (filters.labs?.length) q.cert = { $in: filters.labs };
  if (filters.growthTypes?.length) q.growth_type = { $in: filters.growthTypes };

  const range = (field: string, min?: number, max?: number) => {
    if (min == null && max == null) return;
    q[field] = { ...(min != null ? { $gte: min } : {}), ...(max != null ? { $lte: max } : {}) };
  };
  range(filters.priceMode === "per_ct" ? "rate" : "amount", filters.priceMin, filters.priceMax);

  if (filters.locations?.length) {
    q.location = filters.excludeLocations ? { $nin: filters.locations } : { $in: filters.locations };
  }

  range("depth_pct", filters.depthPctMin, filters.depthPctMax);
  range("table_pct", filters.tablePctMin, filters.tablePctMax);
  range("ratio", filters.ratioMin, filters.ratioMax);
  range("length_mm", filters.lengthMin, filters.lengthMax);
  range("width_mm", filters.widthMin, filters.widthMax);
  range("depth_mm", filters.depthMmMin, filters.depthMmMax);

  if (and.length) q.$and = and;
  return q;
}

// Carat and (total) price, each ascending or descending — the two sort
// dimensions the builder/public results grid exposes. `_id` is always the
// tiebreaker, for stable pagination when many stones share a value.
export type DiamondSortField = "amount" | "carat";
export type DiamondSort = { field: DiamondSortField; dir: "asc" | "desc" };
export const DEFAULT_SORT: DiamondSort = { field: "amount", dir: "asc" };

const SORT_FIELDS: DiamondSortField[] = ["amount", "carat"];

/** Parses a client-supplied `{ field, dir }` into a validated DiamondSort, falling back to the default for anything unrecognized. */
export function parseSort(input: unknown): DiamondSort {
  const s = (input ?? {}) as { field?: unknown; dir?: unknown };
  const field = SORT_FIELDS.includes(s.field as DiamondSortField) ? (s.field as DiamondSortField) : DEFAULT_SORT.field;
  const dir = s.dir === "desc" ? "desc" : DEFAULT_SORT.dir;
  return { field, dir };
}

async function runQuery(
  query: Filter<any>,
  { page = 1, pageSize = 40, sort = DEFAULT_SORT }: { page?: number; pageSize?: number; sort?: DiamondSort } = {}
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const db = await getDb();
  const col = db.collection("diamond_stock");
  const [docs, total] = await Promise.all([
    col
      .find(query, { projection: PUBLIC_PROJECTION })
      .sort({ [sort.field]: sort.dir === "asc" ? 1 : -1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    col.countDocuments(query),
  ]);
  return { rows: docs.map((d) => serialize(d) as unknown as Record<string, unknown>), total };
}

export async function queryDiamondStock(
  filters: DiamondFilters,
  opts: { page?: number; pageSize?: number; sort?: DiamondSort } = {}
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  return runQuery(buildQuery(filters), opts);
}

// A public catalog link's own search: `base` is the catalog's saved filter
// (what the link is allowed to show at all), `extra` is whatever the
// visitor narrows it down with client-side. Combined with $and so a visitor
// can only ever narrow a catalog, never see outside what it shares.
export async function queryDiamondStockScoped(
  base: DiamondFilters,
  extra: DiamondFilters,
  opts: { page?: number; pageSize?: number; sort?: DiamondSort } = {}
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  return runQuery({ $and: [buildQuery(base), buildQuery(extra)] }, opts);
}

export async function countDiamondStock(filters: DiamondFilters): Promise<number> {
  const db = await getDb();
  return db.collection("diamond_stock").countDocuments(buildQuery(filters));
}

export type StockFacets = {
  shapes: { value: string; count: number }[];
  whiteColors: { value: string; count: number }[];
  fancyHues: { value: string; count: number }[];
  clarities: { value: string; count: number }[];
  cuts: { value: string; count: number }[];
  polishes: { value: string; count: number }[];
  symms: { value: string; count: number }[];
  fluorescences: { value: string; count: number }[];
  labs: { value: string; count: number }[];
  locations: { value: string; count: number }[];
  growthTypes: { value: string; count: number }[];
};

function tally(rows: { value: string | null }[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.value) continue;
    counts.set(r.value, (counts.get(r.value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

async function facetsForQuery(query: Filter<any>): Promise<StockFacets> {
  const db = await getDb();
  const rows = (await db
    .collection("diamond_stock")
    .find(
      query,
      { projection: { shape: 1, color: 1, clarity: 1, cut: 1, polish: 1, symm: 1, fls: 1, cert: 1, location: 1, growth_type: 1 } }
    )
    .toArray()) as unknown as {
    shape: string; color: string;
    clarity: string; cut: string | null; polish: string | null; symm: string | null;
    fls: string | null; cert: string; location: string | null; growth_type: string | null;
  }[];

  return {
    shapes: tally(rows.map((r) => ({ value: r.shape }))),
    whiteColors: tally(rows.filter((r) => isWhiteGrade(r.color ?? "")).map((r) => ({ value: r.color }))),
    fancyHues: tally(rows.filter((r) => r.color && !isWhiteGrade(r.color)).map((r) => ({ value: dominantHue(r.color) }))),
    clarities: tally(rows.map((r) => ({ value: r.clarity }))),
    cuts: tally(rows.map((r) => ({ value: r.cut }))),
    polishes: tally(rows.map((r) => ({ value: r.polish }))),
    symms: tally(rows.map((r) => ({ value: r.symm }))),
    fluorescences: tally(rows.map((r) => ({ value: r.fls }))),
    labs: tally(rows.map((r) => ({ value: r.cert }))),
    locations: tally(rows.map((r) => ({ value: r.location }))),
    growthTypes: tally(rows.map((r) => ({ value: r.growth_type }))),
  };
}

/** Distinct filter option values actually present in current stock, with counts — powers the builder's filter chips instead of a hardcoded (and possibly stale) list. */
export async function getStockFacets(): Promise<StockFacets> {
  return facetsForQuery({ stone_stage: "OH" });
}

/** Same, but scoped to a catalog's own saved filter — so a public link's filter panel only ever offers options within what that catalog shares. */
export async function getScopedStockFacets(base: DiamondFilters): Promise<StockFacets> {
  return facetsForQuery(buildQuery(base));
}
