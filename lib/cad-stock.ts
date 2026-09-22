// Server-only. Certified-diamond stock lookups (diamond_stock collection) and
// the Excel-row mapping used by the stock-import route. Every caller must
// itself be behind an auth check.
import { getDb } from "@/lib/mongo";
import { CERTIFIED_SHAPE_MAP, type CertifiedLookupResult } from "@/lib/cad-pricing";

// Progressively widen the carat band until there are enough matches for a
// meaningful median (the user chose median-of-matches over cheapest-single,
// so a lone match isn't a great basis — but it's better than nothing).
const TOLERANCE_BANDS = [0.03, 0.05, 0.1, 0.2];
const MIN_MATCHES_FOR_MEDIAN = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function lookupCertifiedRate(
  shape: string,
  carat: number
): Promise<CertifiedLookupResult | null> {
  const excelShape = CERTIFIED_SHAPE_MAP[shape];
  if (!excelShape) return null;

  const db = await getDb();
  let widest: { rate: number }[] | null = null;
  let widestTol = TOLERANCE_BANDS[0];

  for (const tol of TOLERANCE_BANDS) {
    const data = (await db
      .collection("diamond_stock")
      .find({ shape: excelShape, carat: { $gte: carat - tol, $lte: carat + tol } }, { projection: { rate: 1 } })
      .toArray()) as unknown as { rate: number }[];

    if (data && data.length > 0) {
      widest = data;
      widestTol = tol;
    }
    if (data && data.length >= MIN_MATCHES_FOR_MEDIAN) {
      return { ratePerCt: median(data.map((r) => r.rate)), matchCount: data.length, tolerance: tol };
    }
  }

  // Nothing hit the >=3 threshold at any band — accept whatever the widest
  // band found (even a single stone) rather than give up entirely.
  if (widest && widest.length > 0) {
    return { ratePerCt: median(widest.map((r) => r.rate)), matchCount: widest.length, tolerance: widestTol };
  }
  return null;
}

// Parses the Excel "Measurement" column's leading dimension(s) as a
// diameter for nearest-match purposes. Formats seen: "13.83-13.97x8.61"
// (round: two diameters x depth -> average the two), "10.00X7.00x4.5"
// (fancy: length x width x depth -> use the first number). Best-effort —
// this only backs the rare fallback path (~1-3% of qualifying designs)
// where a design has no carat anywhere in its own tags.
function parseMeasurementDiameter(measurement: string | null): number | null {
  if (!measurement) return null;
  const firstToken = measurement.split(/[xX]/)[0].trim();
  if (firstToken.includes("-")) {
    const [a, b] = firstToken.split("-").map((s) => parseFloat(s));
    if (!Number.isNaN(a) && !Number.isNaN(b)) return (a + b) / 2;
  }
  const n = parseFloat(firstToken);
  return Number.isNaN(n) ? null : n;
}

const NEAREST_N_FOR_CARAT_ESTIMATE = 5;

export async function estimateCaratFromMeasurement(shape: string, mm: number): Promise<number | null> {
  const excelShape = CERTIFIED_SHAPE_MAP[shape];
  if (!excelShape) return null;

  const db = await getDb();
  const data = (await db
    .collection("diamond_stock")
    .find({ shape: excelShape, measurement: { $ne: null } }, { projection: { carat: 1, measurement: 1 } })
    .toArray()) as unknown as { carat: number; measurement: string }[];

  if (data.length === 0) return null;

  const withDiameter = data
    .map((row) => ({ carat: row.carat as number, diameter: parseMeasurementDiameter(row.measurement as string) }))
    .filter((row): row is { carat: number; diameter: number } => row.diameter != null);

  if (withDiameter.length === 0) return null;

  withDiameter.sort((a, b) => Math.abs(a.diameter - mm) - Math.abs(b.diameter - mm));
  const nearest = withDiameter.slice(0, NEAREST_N_FOR_CARAT_ESTIMATE);
  return median(nearest.map((r) => r.carat));
}

// ---------------------------------------------------------------------
// Excel row mapping (used by app/api/diamond-stock/import/route.ts)
// ---------------------------------------------------------------------

/**
 * Parses the Measurement column into three numeric dimensions. Verified
 * against every shape in the stock sheet: round stones (and rose-cut round)
 * are "d1-d2xdepth" (two diameters, dash-separated, then depth); every other
 * shape is "LengthxWidthxDepth" (plain x-separated triple). Detected by
 * format, not by shape name, so it's robust to either being used for any
 * shape.
 */
function parseMeasurementDimensions(
  measurement: string | undefined
): { length: number; width: number; depth: number } | null {
  if (!measurement) return null;
  // Tolerate stray spacing, "×"/"*" instead of "x", and comma decimals
  // ("13,83 - 13,97 × 8,61") so a slightly different export still parses.
  const m = measurement.trim().replace(/\s+/g, "").replace(/[×✕*]/g, "x").replace(/,/g, ".");
  const num = "(\\d+(?:\\.\\d+)?)";
  const dashFormat = new RegExp(`^${num}-${num}x${num}$`, "i").exec(m);
  if (dashFormat) {
    return { length: parseFloat(dashFormat[1]), width: parseFloat(dashFormat[2]), depth: parseFloat(dashFormat[3]) };
  }
  const plainFormat = new RegExp(`^${num}x${num}x${num}$`, "i").exec(m);
  if (plainFormat) {
    return { length: parseFloat(plainFormat[1]), width: parseFloat(plainFormat[2]), depth: parseFloat(plainFormat[3]) };
  }
  return null;
}

/** Growth method, from the Comments column ("CVD" / "HPHT" / blank / stray values -> "Other"). */
function deriveGrowthType(comments: string | undefined): string {
  if (!comments) return "Other";
  const c = comments.trim().toUpperCase();
  if (c === "CVD") return "CVD";
  if (c === "HPHT") return "HPHT";
  return "Other";
}

// A plain color grade or range: "E", "D", ..., "O-P". Anything else in the
// Col column ("Fancy Vivid Pink", "Light Yellow", ...) is a fancy color.
const PLAIN_COLOR_GRADE_RE = /^[D-Z](-[D-Z])?$/i;

function deriveColorMode(color: string | undefined): string | null {
  if (!color) return null;
  return PLAIN_COLOR_GRADE_RE.test(color.trim()) ? "white" : "fancy";
}

// Sheet1 header -> diamond_stock column, verified against
// "Full Stock List 02-09-26.xlsx".
const HEADER_MAP: Record<string, string> = {
  Location: "location",
  "Stone ID": "stone_id",
  Cert: "cert",
  Shape: "shape",
  Carat: "carat",
  Col: "color",
  Clarity: "clarity",
  Cut: "cut",
  Polish: "polish",
  Symm: "symm",
  Fls: "fls",
  Rate: "rate",
  Amount: "amount",
  Measurement: "measurement",
  Table: "table_pct",
  Depth: "depth_pct",
  CA: "ca",
  CH: "ch",
  PA: "pa",
  PH: "ph",
  Ratio: "ratio",
  "Report No": "report_no",
  Comments: "comments",
  Girdle: "girdle",
  Culet: "culet",
  Shade: "shade",
  Milky: "milky",
  "Eye Clean": "eye_clean",
  "Image Link": "image_link",
  "Video Link": "video_link",
  Cert_Link: "cert_link",
  Extra: "extra",
  Cert_Stage: "cert_stage",
  Price_Stage: "price_stage",
  "Stone Stage": "stone_stage",
};

const NUMERIC_COLUMNS = new Set([
  "carat", "rate", "amount", "table_pct", "depth_pct", "ca", "ch", "pa", "ph", "ratio",
]);

/** Maps one xlsx.utils.sheet_to_json row (keyed by header text) to a diamond_stock insert row, or null if it's missing a required field. */
export function excelRowToStockRow(
  row: Record<string, unknown>,
  batchId: string
): Record<string, unknown> | null {
  const out: Record<string, unknown> = { batch_id: batchId };

  for (const [header, column] of Object.entries(HEADER_MAP)) {
    const raw = row[header];
    if (raw == null || raw === "") continue;
    if (NUMERIC_COLUMNS.has(column)) {
      const n = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (!Number.isNaN(n)) out[column] = n;
    } else {
      out[column] = String(raw).trim();
    }
  }

  if (typeof out.shape === "string") out.shape = out.shape.toUpperCase();

  if (!out.shape || out.carat == null || out.rate == null) return null;

  const dims = parseMeasurementDimensions(out.measurement as string | undefined);
  if (dims) {
    out.length_mm = dims.length;
    out.width_mm = dims.width;
    out.depth_mm = dims.depth;
  }
  out.growth_type = deriveGrowthType(out.comments as string | undefined);
  out.color_mode = deriveColorMode(out.color as string | undefined);

  return out;
}
