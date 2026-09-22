import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { searchCadDesigns, getCadDesignById, type CadDataset } from "@/lib/cad-designs";
import { computeCadQuote, type Purity, type CadQuote, type CertifiedLookup, type MeasurementCaratEstimate } from "@/lib/cad-pricing";
import { lookupCertifiedRate, estimateCaratFromMeasurement } from "@/lib/cad-stock";

const PAGE_SIZE = 40;
// "all" mode (select-all-matching) still bounds how many designs one
// request will price, so a very broad filter (no category/search) can't
// hang the request indefinitely.
const ALL_MODE_CAP = 6000;
const VALID_METALS: Purity[] = ["Silver", "10k", "14k", "18k", "Platinum"];
const VALID_DATASETS: CadDataset[] = ["design", "luxe"];

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Certified/measurement lookups don't depend on metal, and the same
// (shape, carat) — "1ct Round", "0.5ct Princess" — recurs constantly across
// a page of designs. Memoizing per request (by Promise, so concurrent
// identical calls share one in-flight query instead of each firing their
// own) turns what was previously up to designs × metals × up to-4 DB
// round-trips into a handful of real queries per request.
function memoize<A extends unknown[], R>(fn: (...args: A) => Promise<R>, keyOf: (...args: A) => string) {
  const cache = new Map<string, Promise<R>>();
  return (...args: A): Promise<R> => {
    const key = keyOf(...args);
    let hit = cache.get(key);
    if (!hit) {
      hit = fn(...args);
      cache.set(key, hit);
    }
    return hit;
  };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const category: string | undefined = body.category || undefined;
  const datasets: CadDataset[] = Array.isArray(body.datasets)
    ? body.datasets.filter((d: string): d is CadDataset => VALID_DATASETS.includes(d as CadDataset))
    : VALID_DATASETS;
  const metals: Purity[] = Array.isArray(body.metals)
    ? body.metals.filter((m: string): m is Purity => VALID_METALS.includes(m as Purity))
    : ["14k"];
  const extraPercent = Number(body.extraPercent) || 0;
  const search: string | undefined = body.search || undefined;
  const mode = body.mode === "OR" ? "OR" : "AND";
  const all: boolean = body.all === true;
  // Design Finder only browses — skip the (DB-backed) pricing pass.
  const withQuotes: boolean = body.withQuotes !== false;
  const ids: string[] | undefined = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : undefined;
  const page = Math.max(1, Number(body.page) || 1);

  if (datasets.length === 0 || metals.length === 0) {
    return NextResponse.json({ items: [], total: 0, page, pageSize: PAGE_SIZE });
  }

  // `ids` re-hydrates an explicit selection (e.g. designs picked in Design
  // Finder) in the given order instead of running a search.
  const matched = ids
    ? ids.map(getCadDesignById).filter((d): d is NonNullable<typeof d> => !!d)
    : searchCadDesigns({ category, datasets, search, mode });
  const total = matched.length;
  const pageItems = all || ids ? matched.slice(0, ALL_MODE_CAP) : matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const cachedLookupCertifiedRate: CertifiedLookup = memoize(
    lookupCertifiedRate,
    (shape, carat) => `${shape}:${carat.toFixed(4)}`
  );
  const cachedEstimateCarat: MeasurementCaratEstimate = memoize(
    estimateCaratFromMeasurement,
    (shape, mm) => `${shape}:${mm.toFixed(4)}`
  );

  const items = await mapWithConcurrency(pageItems, 8, async (design) => {
    if (!withQuotes) return { design, quotes: {} as Partial<Record<Purity, CadQuote>> };
    const entries = await Promise.all(
      metals.map(async (metal) => {
        const quote = await computeCadQuote(
          { type: design.type, tags: design.tags },
          { metal, extraPercent },
          cachedLookupCertifiedRate,
          cachedEstimateCarat
        );
        return [metal, quote] as const;
      })
    );
    const quotes = Object.fromEntries(entries) as Partial<Record<Purity, CadQuote>>;
    return { design, quotes };
  });

  return NextResponse.json({
    items,
    total,
    page: all || ids ? 1 : page,
    pageSize: all || ids ? pageItems.length : PAGE_SIZE,
    truncated: all && total > pageItems.length,
  });
}
