// Server-only. Shared query builder for diamond_stock — used by both the
// authenticated builder's live preview and the public /diamonds/[code] page
// (which re-runs the saved filter against CURRENT stock on every view, per
// the "live filtered link" design). diamond_stock is only reachable through
// this module — callers must do their own auth checks.
import { createHash } from "crypto";
import type { Db, Filter } from "mongodb";
import { getDb, serialize } from "@/lib/mongo";
import { PRICING_PROFILE, priceStockRowForStorage } from "@/lib/diamond-pricing";
import { checkUncheckedOnPage, mediaRank } from "@/lib/media-check";

export type DiamondFilters = {
  /** IGI/GIA/etc. certificate (report) number — free-text, partial match. Admin-only: never exposed on the public catalog UI or accepted from public filter input. */
  reportNo?: string;
  shapes?: string[];
  caratMin?: number;
  caratMax?: number;
  colorMode?: "white" | "fancy"; // omitted = both ("All"); colors / fancyHues picked there match either
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
  "report_no", "image_link", "video_link", "cert_link", "video_ok",
];
// image_ok is read only to blank out a dead image link, media_checked_at /
// media_attempts only to spot stones not checked yet (see runQuery) — none
// of them is sent out.
const PUBLIC_PROJECTION = Object.fromEntries(
  [...PUBLIC_STOCK_COLUMNS, "image_ok", "media_checked_at", "media_attempts"].map((c) => [c, 1])
);

/** Links whose media was checked and found missing (lib/media-check.ts) are never sent to a page. */
function toPublicRow(doc: Record<string, unknown>): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { image_ok, media_checked_at, media_attempts, ...row } = serialize(doc as { _id?: unknown }) as Record<string, unknown>;
  if (image_ok === false) row.image_link = null;
  if (row.video_ok === false) row.video_link = null;
  return row;
}

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
  // Always-on: only stones actually on hand (excludes transferred-out,
  // memo and on-hold rows, which aren't available stock).
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
  const hueMatch = (h: string) => ({ color: { $regex: `\\s${escapeRegex(h)}$`, $options: "i" } });
  if (!filters.colorMode && (filters.colors?.length || filters.fancyHues?.length)) {
    // "All" tab with some white grades and/or fancy hues picked: either kind matches.
    and.push({
      $or: [
        ...(filters.colors?.length ? [{ color: { $in: filters.colors } }] : []),
        ...(filters.fancyHues ?? []).map(hueMatch),
      ],
    });
  } else if (filters.colorMode === "white") {
    q.color = filters.colors?.length ? { $in: filters.colors } : { $regex: WHITE_GRADE_REGEX };
  } else if (filters.colorMode === "fancy") {
    if (filters.fancyHues?.length) {
      and.push({ $or: filters.fancyHues.map(hueMatch) });
    } else {
      and.push({ color: { $not: new RegExp(WHITE_GRADE_REGEX) } });
      and.push({ color: { $ne: null } });
    }
  }
  if (filters.noBgm) q.shade = "NO BGM";
  if (filters.withMedia) q.media_rank = 0; // a photo or video that actually loads

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
  // The price customers see is the catalog (sell) price, so that's what the
  // price filter matches — not the landed cost in rate/amount.
  range(filters.priceMode === "per_ct" ? "catalog_rate" : "catalog_amount", filters.priceMin, filters.priceMax);

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

// ---------------------------------------------------------------------
// Keeping stored fields current
// ---------------------------------------------------------------------

/**
 * Identifies the pricing rules each doc's catalog_rate / catalog_amount were
 * computed with. Bump PRICING_ENGINE_REVISION when the pricing *code* (not
 * just PRICING_PROFILE numbers) changes the result.
 */
const PRICING_ENGINE_REVISION = 1;
export const PRICING_VERSION = createHash("sha1")
  .update(JSON.stringify({ PRICING_PROFILE, PRICING_ENGINE_REVISION }))
  .digest("hex")
  .slice(0, 12);

const READY_BATCH = 1000;
let readyPromise: Promise<void> | null = null;

/**
 * Catalog sorting and price filtering run on the stored catalog_amount /
 * catalog_rate and media_rank. Once per server process, re-price docs
 * priced under older rules (i.e. after a PRICING_PROFILE change is
 * deployed) and fill media_rank on docs that predate it. Cheap no-op when
 * everything is current.
 */
export function ensureStockReady(db: Db): Promise<void> {
  readyPromise ??= (async () => {
    const col = db.collection("diamond_stock");
    for (;;) {
      const stale = await col
        .find({ pricing_version: { $ne: PRICING_VERSION } }, { projection: { rate: 1, amount: 1, carat: 1, color: 1, clarity: 1 } })
        .limit(READY_BATCH)
        .toArray();
      if (!stale.length) break;
      await col.bulkWrite(
        stale.map((d) => ({
          updateOne: {
            filter: { _id: d._id },
            update: {
              $set: {
                ...priceStockRowForStorage({
                  rate: Number(d.rate), amount: Number(d.amount), carat: Number(d.carat),
                  color: String(d.color ?? ""), clarity: String(d.clarity ?? ""),
                }),
                pricing_version: PRICING_VERSION,
              },
            },
          },
        })),
        { ordered: false }
      );
    }
    for (;;) {
      const unranked = await col
        .find({ media_rank: { $exists: false } }, { projection: { image_link: 1, video_link: 1, cert_link: 1, image_ok: 1, video_ok: 1 } })
        .limit(READY_BATCH)
        .toArray();
      if (!unranked.length) break;
      await col.bulkWrite(
        unranked.map((d) => ({ updateOne: { filter: { _id: d._id }, update: { $set: { media_rank: mediaRank(d) } } } })),
        { ordered: false }
      );
    }
  })().catch((e) => {
    readyPromise = null; // retry on the next request
    throw e;
  });
  return readyPromise;
}

const READY_WAIT_MS = 1500;

/**
 * Waits for ensureStockReady, but at most READY_WAIT_MS: after a pricing
 * change, re-pricing all stock takes minutes, and visitors shouldn't wait
 * for it — until it finishes, a few stones may sort slightly off. It keeps
 * going in the background and resumes on the next request if cut short.
 */
async function stockReady(db: Db): Promise<void> {
  await Promise.race([
    ensureStockReady(db).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, READY_WAIT_MS)),
  ]);
}

/**
 * Bumped whenever stock changes (import, purge, assign, supplier removal),
 * so per-process caches keyed on it (facets) drop stale entries.
 */
export async function bumpStockVersion(db: Db) {
  await db.collection<{ _id: string; version: number }>("meta").updateOne({ _id: "stock" }, { $inc: { version: 1 } }, { upsert: true });
}
async function getStockVersion(db: Db): Promise<number> {
  const doc = await db.collection<{ _id: string; version: number }>("meta").findOne({ _id: "stock" });
  return doc?.version ?? 0;
}

// ---------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------

// Carat and price, each ascending or descending — the two sort dimensions
// the builder/public results grid exposes. Stones with a working photo or
// video always come first, then certificate-only, then the rest
// (media_rank), whichever sort is chosen; `_id` is the final tiebreaker
// for stable pagination.
export type DiamondSortField = "amount" | "carat";
export type DiamondSort = { field: DiamondSortField; dir: "asc" | "desc" };
export const DEFAULT_SORT: DiamondSort = { field: "amount", dir: "asc" };

const SORT_FIELDS: DiamondSortField[] = ["amount", "carat"];
// "amount" means the price shown, i.e. the stored catalog (sell) price —
// kept current by ensureStockReady — not the landed cost.
const SORT_COLUMN: Record<DiamondSortField, string> = { amount: "catalog_amount", carat: "carat" };

/** Parses a client-supplied `{ field, dir }` into a validated DiamondSort, falling back to the default for anything unrecognized. */
export function parseSort(input: unknown): DiamondSort {
  const s = (input ?? {}) as { field?: unknown; dir?: unknown };
  const field = SORT_FIELDS.includes(s.field as DiamondSortField) ? (s.field as DiamondSortField) : DEFAULT_SORT.field;
  const dir = s.dir === "desc" ? "desc" : DEFAULT_SORT.dir;
  return { field, dir };
}

/**
 * How long a page request may spend checking its own unchecked stones'
 * media: longer for page 1 (what a visitor sees first), shorter for later
 * pages, which the viewer prefetches while the visitor is still scrolling.
 */
const PAGE_CHECK_BUDGET_MS = { first: 5000, later: 2500 };

async function runQuery(
  query: Filter<any>,
  { page = 1, pageSize = 40, sort = DEFAULT_SORT }: { page?: number; pageSize?: number; sort?: DiamondSort } = {}
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const db = await getDb();
  await stockReady(db);
  const col = db.collection("diamond_stock");
  const fetchPage = () =>
    col
      .find(query, { projection: PUBLIC_PROJECTION })
      .sort({ media_rank: 1, [SORT_COLUMN[sort.field]]: sort.dir === "asc" ? 1 : -1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();
  const [firstPage, total] = await Promise.all([fetchPage(), col.countDocuments(query)]);
  let docs = firstPage;

  // Stones the full media check (lib/media-check.ts) hasn't reached yet are
  // assumed to have media, so they could sit on this page without any.
  // Check them now; any found empty sort lower, so fetch the page again and
  // repeat for whichever stones moved up — within a time budget. Results
  // are stored, so only the first visitor to a page waits for this. A stone
  // whose host didn't answer in time (media_attempts set) is left to the
  // full pass, which allows slow hosts longer — so no visitor waits on it
  // twice.
  const deadline = Date.now() + (page === 1 ? PAGE_CHECK_BUDGET_MS.first : PAGE_CHECK_BUDGET_MS.later);
  const tried = new Set<string>();
  for (;;) {
    const unchecked = docs.filter((d) => !d.media_checked_at && !d.media_attempts && !tried.has(String(d._id)));
    if (!unchecked.length || Date.now() > deadline - 1000) break;
    unchecked.forEach((d) => tried.add(String(d._id)));
    if (!(await checkUncheckedOnPage(db, unchecked.map((d) => d._id), deadline))) break;
    docs = await fetchPage();
  }
  return { rows: docs.map(toPublicRow), total };
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
  await stockReady(db);
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

type Tally = { value: string; count: number }[];
const groupBy = (field: string) => [
  { $match: { [field]: { $nin: [null, ""] } } },
  { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $project: { _id: 0, value: "$_id", count: 1 } },
];

const FACET_CACHE_MAX = 200;
const facetCache = new Map<string, Promise<StockFacets>>();

/**
 * Counted inside MongoDB ($facet) rather than by pulling every matching
 * stone into the server, and cached per process until stock changes
 * (bumpStockVersion) — facets depend only on the stock and the filter.
 */
async function facetsForQuery(query: Filter<any>): Promise<StockFacets> {
  const db = await getDb();
  const key = `${await getStockVersion(db)}:${JSON.stringify(query, (_k, v) => (v instanceof RegExp ? String(v) : v))}`;
  const hit = facetCache.get(key);
  if (hit) return hit;

  const run = (async (): Promise<StockFacets> => {
    const [f] = await db
      .collection("diamond_stock")
      .aggregate<Record<string, Tally>>([
        { $match: query },
        {
          $facet: {
            shapes: groupBy("shape"),
            colors: groupBy("color"),
            clarities: groupBy("clarity"),
            cuts: groupBy("cut"),
            polishes: groupBy("polish"),
            symms: groupBy("symm"),
            fluorescences: groupBy("fls"),
            labs: groupBy("cert"),
            locations: groupBy("location"),
            growthTypes: groupBy("growth_type"),
          },
        },
      ])
      .toArray();

    // White grades are listed as-is; fancy colors roll up by dominant hue.
    const fancy = new Map<string, number>();
    for (const c of f.colors) {
      if (isWhiteGrade(c.value)) continue;
      const hue = dominantHue(c.value);
      if (hue) fancy.set(hue, (fancy.get(hue) ?? 0) + c.count);
    }
    return {
      shapes: f.shapes,
      whiteColors: f.colors.filter((c) => isWhiteGrade(c.value)),
      fancyHues: Array.from(fancy, ([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
      clarities: f.clarities,
      cuts: f.cuts,
      polishes: f.polishes,
      symms: f.symms,
      fluorescences: f.fluorescences,
      labs: f.labs,
      locations: f.locations,
      growthTypes: f.growthTypes,
    };
  })();

  facetCache.set(key, run);
  run.catch(() => facetCache.delete(key));
  if (facetCache.size > FACET_CACHE_MAX) facetCache.delete(facetCache.keys().next().value!);
  return run;
}

/** Distinct filter option values actually present in current stock, with counts — powers the builder's filter chips instead of a hardcoded (and possibly stale) list. */
export async function getStockFacets(): Promise<StockFacets> {
  return facetsForQuery({ stone_stage: "OH" });
}

/** Same, but scoped to a catalog's own saved filter — so a public link's filter panel only ever offers options within what that catalog shares. */
export async function getScopedStockFacets(base: DiamondFilters): Promise<StockFacets> {
  return facetsForQuery(buildQuery(base));
}
