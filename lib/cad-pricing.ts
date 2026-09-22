// CAD catalog pricing engine.
//
// Ported from two Python/JS tools in "CAD Tools" that already price this
// exact tag corpus:
//   - design-finder/lib/pricing.js     (melee side-stone table, metal rates,
//                                        main/side stone classification)
//   - build_price_tiers.py             (the newer metal rate card, and a
//                                        more robust two-pass stone-line /
//                                        gold-weight-tag parser that fixes
//                                        under-pricing bugs the single-regex
//                                        version in pricing.js had — ported
//                                        here in place of the older one)
//
// New on top of both of those: certified main-stone pricing (see
// computeCadQuote) — for Solitaire Ring / Three Stone Ring / Solitaire
// Pendant / Studs designs whose center (or, for Studs, each) stone is
// >0.5ct, the main-stone price comes from a real certified-stock lookup
// (lib/cad-stock.ts) instead of the flat per-ct melee estimate.

export type Purity = "Silver" | "10k" | "14k" | "18k" | "Platinum";

export const METAL_PURITY_ORDER: Purity[] = ["Silver", "10k", "14k", "18k", "Platinum"];

export const METAL_LABEL: Record<Purity, string> = {
  Silver: "Sterling Silver",
  "10k": "10K Gold",
  "14k": "14K Gold",
  "18k": "18K Gold",
  Platinum: "Platinum",
};

// USD per gram. Easy to edit as rates move — the newer of the two rate
// cards found in CAD Tools (build_price_tiers.py), diverges from the
// older design-finder/lib/pricing.js (10k 90 / 14k 110 / 18k 136).
export const METAL_PRICE_PER_GRAM: Record<Purity, number> = {
  Silver: 17,
  "10k": 95,
  "14k": 115,
  "18k": 145,
  Platinum: 110,
};

// Standard jewelry alloy densities (g/cm^3), used only to estimate a metal's
// weight when a design has no weight tag for the metal the user picked —
// converted from whichever purity IS tagged, assuming equal volume.
export const METAL_DENSITY_G_PER_CM3: Record<Purity, number> = {
  Silver: 10.36,
  "10k": 11.57,
  "14k": 13.07,
  "18k": 15.58,
  Platinum: 21.45,
};

// mm -> CVD(USD) price-per-carat, for ROUND side (non-main) diamonds only.
export const ROUND_MM_PRICE_TABLE: [number, number][] = [
  [0.8, 190.22], [0.9, 146.74], [1.0, 135.87], [1.1, 135.87], [1.15, 125.0],
  [1.2, 125.0], [1.25, 125.0], [1.3, 83.7], [1.35, 83.7], [1.4, 76.09],
  [1.45, 76.09], [1.5, 76.09], [1.55, 76.09], [1.6, 76.09], [1.7, 76.09],
  [1.8, 59.78], [1.9, 54.35], [2.0, 54.35], [2.2, 54.35], [2.3, 54.35],
  [2.4, 54.35], [2.5, 54.35], [2.6, 54.35], [2.7, 54.35], [2.8, 54.35],
  [2.9, 54.35], [3.0, 54.35], [3.1, 54.35], [3.2, 54.35], [3.3, 54.35],
  [3.4, 54.35], [3.5, 59.78], [3.6, 59.78], [3.7, 59.78], [3.8, 70.65],
  [3.9, 70.65], [4.0, 76.09], [4.1, 76.09], [4.25, 70.65], [4.3, 70.65],
  [4.4, 70.65], [4.5, 70.65], [4.6, 70.65], [4.7, 70.65], [4.8, 70.65],
  [4.9, 70.65], [5.0, 70.65], [5.1, 70.65],
];

export const FANCY_SIDE_PRICE_PER_CT = 100;
export const MAIN_ROUND_PRICE_PER_CT = 100;
export const MAIN_FANCY_PRICE_PER_CT = 130;

// Fixed markup floor. The catalog builder's "extra %" field stacks on top:
// total = subtotal * 1.20 * (1 + extraPercent / 100).
export const BASE_MARKUP = 1.2;

/** Nearest mm row in the round price table (ties resolve to the lower mm). */
export function nearestRoundPricePerCt(mm: number): number {
  let best = ROUND_MM_PRICE_TABLE[0];
  let bestDiff = Math.abs(mm - best[0]);
  for (const row of ROUND_MM_PRICE_TABLE) {
    const diff = Math.abs(mm - row[0]);
    if (diff < bestDiff) {
      best = row;
      bestDiff = diff;
    }
  }
  return best[1];
}

function numOrNull(s: string | undefined | null): number | null {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

const isRound = (shape: string) => shape.toLowerCase() === "round";

// ---------------------------------------------------------------------
// Stone group parsing
// ---------------------------------------------------------------------

export type StoneGroup = {
  shape: string;
  mm: number | null;
  count: number | null;
  eachCt: number | null;
  totalCt: number;
  isDiamond: boolean;
  material: string;
  colour: boolean;
  raw: string;
};

export type StoneParseTier = "detailed" | "short" | "inferred" | "none";

// A stone line is split in two (tail first, then the head read loosely)
// rather than matched by one literal pattern, because the same line is
// written many ways across the catalogs — see build_price_tiers.py's
// comment on STONE_TAIL_RE for the concrete variants this exists to catch.
const STONE_TAIL_RE =
  /^(.+?),\s*(\d+)\s+with Each\s+([\d.]+)ct\s+Total\s+([\d.]+)ct(?:,\s*(.+))?$/i;
const SIZE_TAIL_RE = /([\d.]+)\s*(?:mm)?\s*(?:[xX*]\s*([\d.]+)\s*)?mm$/i;
const COLOUR_RE =
  /\b(RED|BLUE|PINK|GREEN|YELLOW|BLACK|BROWN|PURPLE|ORANGE|CHAMPAGNE|GREY|GRAY)\b/i;
const DIAMOND_RE = /\bDiamonds?\b/i;

function parseStoneLine(tag: string): StoneGroup | null {
  const m = STONE_TAIL_RE.exec(tag);
  if (!m) return null;
  const head = m[1].trim();

  const sizeMatch = SIZE_TAIL_RE.exec(head);
  const mm = sizeMatch ? numOrNull(sizeMatch[1]) : null;
  const material = (sizeMatch ? head.slice(0, sizeMatch.index) : head).trim();

  const parts = material.split(/\s+/).filter(Boolean);
  const shape = parts[0] || "";
  const desc = parts.slice(1).join(" ");

  const colour = COLOUR_RE.test(desc) || COLOUR_RE.test(shape);
  const isDiamond = DIAMOND_RE.test(desc);
  const label = desc.replace(/\s+[A-Z0-9+*#.\-]+$/, "").trim() || desc;

  return {
    shape,
    mm,
    count: parseInt(m[2], 10),
    eachCt: numOrNull(m[3]),
    totalCt: numOrNull(m[4]) ?? 0,
    isDiamond,
    material: label || "Diamond",
    colour,
    raw: tag,
  };
}

const ROUND_SHORT_RE = /^([\d.]+)mm\s*-\s*([\d.]+)ct$/i;
const SHAPE_SHORT_RE = /^([A-Za-z]+)\s*-\s*([\d.]+)ct$/i;
const BARE_CT_RE = /^([\d.]+)ct$/i;
const BARE_MM_RE = /^([\d.]+)mm$/i;

export const KNOWN_SHAPES = new Set([
  "Round", "Princess", "Cushion", "Emerald", "Oval", "Pear", "Radiant",
  "Marquise", "Asscher", "Heart", "Trillion", "Baguette", "Briolette",
]);

/**
 * Parses a design's stone groups, trying progressively looser tag formats.
 * Non-diamond stones (ruby, sapphire, ...) are split out into `other` —
 * there's no rate card for them, so they're never costed, only flagged.
 */
export function parseStoneGroups(tags: string[]): {
  groups: StoneGroup[];
  tier: StoneParseTier;
  other: StoneGroup[];
} {
  const groups: StoneGroup[] = [];
  const other: StoneGroup[] = [];
  for (const tag of tags) {
    const g = parseStoneLine(tag);
    if (!g) continue;
    (g.isDiamond ? groups : other).push(g);
  }
  if (groups.length > 0 || other.length > 0) return { groups, tier: "detailed", other };

  for (const tag of tags) {
    const rm = ROUND_SHORT_RE.exec(tag);
    if (rm) {
      groups.push({
        shape: "Round", mm: numOrNull(rm[1]), count: null, eachCt: null,
        totalCt: numOrNull(rm[2]) ?? 0, isDiamond: true, material: "Diamond",
        colour: false, raw: tag,
      });
      continue;
    }
    const sm = SHAPE_SHORT_RE.exec(tag);
    if (sm && KNOWN_SHAPES.has(sm[1])) {
      groups.push({
        shape: sm[1], mm: null, count: null, eachCt: null,
        totalCt: numOrNull(sm[2]) ?? 0, isDiamond: true, material: "Diamond",
        colour: false, raw: tag,
      });
    }
  }
  if (groups.length > 0) return { groups, tier: "short", other: [] };

  let bareCt: number | null = null;
  let bareShape: string | null = null;
  for (const tag of tags) {
    const cm = BARE_CT_RE.exec(tag);
    if (cm && bareCt == null) bareCt = numOrNull(cm[1]);
    if (KNOWN_SHAPES.has(tag) && bareShape == null) bareShape = tag;
  }
  if (bareCt != null && bareShape != null) {
    groups.push({
      shape: bareShape, mm: null, count: 1, eachCt: bareCt, totalCt: bareCt,
      isDiamond: true, material: "Diamond", colour: false,
      raw: `${bareShape} ${bareCt}ct (inferred, no breakdown tag)`,
    });
    return { groups, tier: "inferred", other: [] };
  }

  return { groups: [], tier: "none", other: [] };
}

/** Bare "<shape>" + "<n>mm" tags with no carat anywhere — the rare (~1-3%) case parseStoneGroups can't size on its own. */
export function findBareShapeAndMm(tags: string[]): { shape: string; mm: number } | null {
  let shape: string | null = null;
  let mm: number | null = null;
  for (const tag of tags) {
    if (shape == null && KNOWN_SHAPES.has(tag)) shape = tag;
    if (mm == null) {
      const m = BARE_MM_RE.exec(tag);
      if (m) mm = numOrNull(m[1]);
    }
  }
  return shape != null && mm != null ? { shape, mm } : null;
}

/**
 * Splits parsed stone groups into a Main stone (single largest count==1
 * group) and the rest as Side stones. Bracelets never get a Main stone —
 * tennis-style designs repeat stones in every group, so everything is Side.
 */
export function classifyStoneGroups(
  design: { type: string },
  groups: StoneGroup[]
): { main: StoneGroup | null; side: StoneGroup[] } {
  if (design.type === "Bracelet") return { main: null, side: groups };

  const singleStoneGroups = groups.filter((g) => g.count === 1);
  if (singleStoneGroups.length === 0) return { main: null, side: groups };

  const main = singleStoneGroups.reduce((best, g) => (g.totalCt > best.totalCt ? g : best));
  const side = groups.filter((g) => g !== main);
  return { main, side };
}

function priceSideGroup(group: StoneGroup): number {
  const perCt = isRound(group.shape) && group.mm != null
    ? nearestRoundPricePerCt(group.mm)
    : FANCY_SIDE_PRICE_PER_CT;
  return perCt * group.totalCt;
}

function flatMainPrice(group: StoneGroup): number {
  const perCt = isRound(group.shape) ? MAIN_ROUND_PRICE_PER_CT : MAIN_FANCY_PRICE_PER_CT;
  return perCt * group.totalCt;
}

// ---------------------------------------------------------------------
// Gold weight tag parsing — ported from build_price_tiers.py
// (purity_from_prefix / parse_gold_weights), which decomposes the weight
// tag's prefix instead of matching a fixed list of literal spellings, so
// it copes with the many variants in these catalogs ("14KT", "18 KT",
// "White Gold 14K PdW", "10KX1", ...).
// ---------------------------------------------------------------------

const WEIGHT_TAG_RE = /^(.*?)\s*([\d.]+)\s*gm\s*$/i;
const PLATINUM_RE = /^(?:PLATINUM|PLT|PLAT|PL)$/;
const SILVER_RE = /^(?:STERLING|SILVER|925)(?:\s+(?:STERLING|SILVER|925))?$/;
const QUALIFIER_RE = /\b(?:YELLOW|WHITE|ROSE|GREEN)\s*GOLD\b|\bGOLD\b|\bPDW\b/g;
const KARAT_RE = /^(\d{1,2})\s*(?:K[A-Z0-9]*|WG)(?:\s+[A-Z0-9]{1,3})?$/;
const KARAT_PURITY: Record<number, Purity> = { 10: "10k", 14: "14k", 18: "18k" };
const PLAIN_RE = /^(?:PLATINUM|STERLING 925|\d{1,2}\s*KT?)$/;

function purityFromPrefix(prefix: string): Purity | null {
  const p = prefix.toUpperCase().replace(/:/g, " ").replace(/\s+/g, " ").trim().replace(/^[\s.,]+|[\s.,]+$/g, "");
  if (!p) return null;
  if (PLATINUM_RE.test(p)) return "Platinum";
  if (SILVER_RE.test(p)) return "Silver";
  const q = p.replace(QUALIFIER_RE, " ").replace(/\s+/g, " ").trim();
  const m = KARAT_RE.exec(q);
  if (m) return KARAT_PURITY[parseInt(m[1], 10)] ?? null;
  return null;
}

/**
 * Metal weight (grams) per quotable purity. When a design tags one purity
 * more than once (e.g. both "14K 5.3gm" and "White Gold 14K PdW 5.3gm"),
 * the plainest spelling wins.
 */
export function parseAllGoldWeights(tags: string[]): Partial<Record<Purity, number>> {
  const weights: Partial<Record<Purity, number>> = {};
  const ranks: Partial<Record<Purity, number>> = {};
  for (const tag of tags) {
    const m = WEIGHT_TAG_RE.exec(tag);
    if (!m) continue;
    const prefix = m[1];
    const purity = purityFromPrefix(prefix);
    if (!purity) continue;
    const grams = numOrNull(m[2]);
    if (grams == null || grams <= 0) continue;
    const plain = PLAIN_RE.test(prefix.toUpperCase().replace(/\s+/g, " ").trim());
    const rank = plain ? 0 : 1;
    if (weights[purity] == null || rank < (ranks[purity] ?? Infinity)) {
      weights[purity] = grams;
      ranks[purity] = rank;
    }
  }
  return weights;
}

export type MetalResolution = {
  grams: number;
  sourcePurity: Purity;
  estimated: boolean;
};

/** Direct weight tag for `targetPurity` if present, else density-converted from whatever purity IS tagged. */
export function resolveMetalGrams(tags: string[], targetPurity: Purity): MetalResolution | null {
  const weights = parseAllGoldWeights(tags);
  const direct = weights[targetPurity];
  if (direct != null) return { grams: direct, sourcePurity: targetPurity, estimated: false };

  for (const sourcePurity of METAL_PURITY_ORDER) {
    const grams = weights[sourcePurity];
    if (grams == null) continue;
    const converted =
      (grams * METAL_DENSITY_G_PER_CM3[targetPurity]) / METAL_DENSITY_G_PER_CM3[sourcePurity];
    return { grams: converted, sourcePurity, estimated: true };
  }
  return null;
}

/** Ceiling to 1 decimal place, then add 0.3g buffer. */
export function adjustedMetalGrams(rawGrams: number): number {
  return Math.ceil(rawGrams * 10) / 10 + 0.3;
}

// ---------------------------------------------------------------------
// Certified main-stone pricing
// ---------------------------------------------------------------------

// Categories where the CENTER stone (Studs: EACH stone) gets certified
// pricing instead of the flat melee rate, when it's >0.5ct. Detected by
// case-insensitive substring match against the design's own tags — the
// same technique design-finder's search already uses on this tag corpus.
export const CERTIFIED_CATEGORY_PHRASES = ["Solitaire Ring", "Three Stone Ring", "Solitaire Pendant"];

// Excel stock shape enum. Trillion/Baguette/Briolette are intentionally
// absent — there's no certified stock in those shapes, so a main stone in
// one of them always falls back to the flat melee rate.
export const CERTIFIED_SHAPE_MAP: Record<string, string> = {
  Round: "ROUND", Princess: "PRINCESS", Cushion: "CUSHION", Emerald: "EMERALD",
  Oval: "OVAL", Pear: "PEAR", Radiant: "RADIANT", Marquise: "MARQUISE",
  Asscher: "ASSCHER", Heart: "HEART",
};

export function tagsInclude(tags: string[], phrase: string): boolean {
  const needle = phrase.toLowerCase();
  return tags.some((t) => t.toLowerCase().includes(needle));
}

export type CertifiedLookupResult = { ratePerCt: number; matchCount: number; tolerance: number };
export type CertifiedLookup = (shape: string, carat: number) => Promise<CertifiedLookupResult | null>;
export type MeasurementCaratEstimate = (shape: string, mm: number) => Promise<number | null>;

export type QuoteFlag =
  | "no-metal-weight"
  | "estimated-metal-weight"
  | "certified-unavailable-shape"
  | "certified-no-stock-match"
  | "estimated-from-measurement"
  | "no-main-stone-data"
  | "non-diamond-stone-uncosted";

export type CertifiedSource = "certified" | "estimated-measurement" | "estimated" | "unavailable" | null;

export type CadQuote = {
  mainPrice: number;
  sideTotal: number;
  metalPrice: number;
  subtotal: number;
  total: number;
  metal: {
    purity: Purity;
    sourcePurity: Purity;
    estimated: boolean;
    rawGrams: number;
    grams: number;
    ratePerGram: number;
  } | null;
  main: StoneGroup | null;
  side: StoneGroup[];
  certifiedSource: CertifiedSource;
  flags: QuoteFlag[];
};

export type CadDesignInput = { type: string; tags: string[] };

/** Center/each-stone certified lookup shared by both the generic-main and Studs paths. */
async function certifyOrFallback(
  group: StoneGroup,
  carat: number,
  countForTotal: number,
  lookupCertifiedRate: CertifiedLookup,
  flags: QuoteFlag[]
): Promise<{ price: number; source: CertifiedSource }> {
  const excelShape = CERTIFIED_SHAPE_MAP[group.shape];
  if (!excelShape) {
    flags.push("certified-unavailable-shape");
    return { price: flatMainPrice(group), source: "unavailable" };
  }
  const hit = await lookupCertifiedRate(group.shape, carat);
  if (!hit) {
    flags.push("certified-no-stock-match");
    return { price: flatMainPrice(group), source: "unavailable" };
  }
  return { price: hit.ratePerCt * carat * countForTotal, source: "certified" };
}

/**
 * Full quote for one CAD design at a chosen metal + extra markup %.
 * `lookupCertifiedRate`/`estimateCaratFromMeasurement` are injected so this
 * module stays a pure, DB-free port — the real Supabase-backed
 * implementations live in lib/cad-stock.ts.
 */
export async function computeCadQuote(
  design: CadDesignInput,
  opts: { metal: Purity; extraPercent: number },
  lookupCertifiedRate: CertifiedLookup,
  estimateCaratFromMeasurement: MeasurementCaratEstimate
): Promise<CadQuote> {
  const flags: QuoteFlag[] = [];
  const { groups, tier, other } = parseStoneGroups(design.tags);
  if (other.length > 0) flags.push("non-diamond-stone-uncosted");

  const { main, side } = classifyStoneGroups(design, groups);
  const isCertifiedCategory = CERTIFIED_CATEGORY_PHRASES.some((p) => tagsInclude(design.tags, p));
  const isStuds = design.type === "Earring" && tagsInclude(design.tags, "Stud");

  let mainPrice = 0;
  let certifiedSource: CertifiedSource = null;
  let sideForTotal = side;

  if (isStuds) {
    // Both earring stones share one count>1 group — classifyStoneGroups
    // would otherwise leave it entirely in `side` (mm-priced). Pull the
    // design's primary diamond group out and treat eachCt as the
    // per-stone carat (the user's ">0.5ct each" rule).
    const diamondGroups = groups.filter((g) => g.isDiamond);
    const studGroup = diamondGroups.length
      ? diamondGroups.reduce((best, g) => (g.totalCt > best.totalCt ? g : best))
      : null;
    sideForTotal = groups.filter((g) => g !== studGroup);

    if (studGroup) {
      const count = studGroup.count ?? 1;
      const perStoneCt = studGroup.eachCt ?? studGroup.totalCt / count;
      if (perStoneCt > 0.5) {
        const result = await certifyOrFallback(studGroup, perStoneCt, count, lookupCertifiedRate, flags);
        mainPrice = result.price;
        certifiedSource = result.source;
      } else {
        mainPrice = flatMainPrice(studGroup);
      }
    }
  } else if (main) {
    if (isCertifiedCategory && main.totalCt > 0.5) {
      const result = await certifyOrFallback(main, main.totalCt, 1, lookupCertifiedRate, flags);
      mainPrice = result.price;
      certifiedSource = result.source;
    } else {
      mainPrice = flatMainPrice(main);
    }
  } else if (isCertifiedCategory) {
    // No breakdown tag at all (tier === "none") — the rare case where a
    // qualifying design has no explicit carat anywhere. Fall back to
    // whatever bare shape+mm tags exist and infer carat from the stock
    // sheet's Measurement column.
    const bare = tier === "none" ? findBareShapeAndMm(design.tags) : null;
    if (bare) {
      const inferredCt = await estimateCaratFromMeasurement(bare.shape, bare.mm);
      if (inferredCt != null) {
        flags.push("estimated-from-measurement");
        const inferredGroup: StoneGroup = {
          shape: bare.shape, mm: bare.mm, count: 1, eachCt: inferredCt, totalCt: inferredCt,
          isDiamond: true, material: "Diamond", colour: false, raw: "(inferred from measurement)",
        };
        if (inferredCt > 0.5) {
          const result = await certifyOrFallback(inferredGroup, inferredCt, 1, lookupCertifiedRate, flags);
          mainPrice = result.price;
          certifiedSource = result.source === "certified" ? "estimated-measurement" : result.source;
        } else {
          mainPrice = flatMainPrice(inferredGroup);
        }
      } else {
        flags.push("no-main-stone-data");
      }
    } else {
      flags.push("no-main-stone-data");
    }
  }

  const sideTotal = sideForTotal.reduce((sum, g) => sum + priceSideGroup(g), 0);

  const resolved = resolveMetalGrams(design.tags, opts.metal);
  let metalPrice = 0;
  let metal: CadQuote["metal"] = null;
  if (resolved) {
    const grams = adjustedMetalGrams(resolved.grams);
    const ratePerGram = METAL_PRICE_PER_GRAM[opts.metal];
    metalPrice = grams * ratePerGram;
    metal = {
      purity: opts.metal, sourcePurity: resolved.sourcePurity, estimated: resolved.estimated,
      rawGrams: resolved.grams, grams, ratePerGram,
    };
    if (resolved.estimated) flags.push("estimated-metal-weight");
  } else {
    flags.push("no-metal-weight");
  }

  const subtotal = mainPrice + sideTotal + metalPrice;
  const total = subtotal * BASE_MARKUP * (1 + opts.extraPercent / 100);

  return {
    mainPrice, sideTotal, metalPrice, subtotal, total, metal,
    main: isStuds ? null : main, side: sideForTotal, certifiedSource, flags,
  };
}
