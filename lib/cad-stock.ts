// Server-only. Certified-diamond stock lookups (diamond_stock collection).
// Every caller must itself be behind an auth check. (The stock-import Excel
// mapping lives in lib/diamond-stock-import.ts.)
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
