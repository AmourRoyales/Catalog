// Server-only (pulls in xlsx). Turns a supplier stock workbook into
// diamond_stock rows. Suppliers each export their own layout — different
// sheet names, header text, column order, grade spellings and measurement
// formats — so instead of one fixed header map, every field has a list of
// header synonyms and every graded value goes through a normalizer, so
// all suppliers' stones land in the same canonical shape the catalog
// filters expect (cut "EX", fluorescence "NON", stone_stage "OH", ...).
//
// Verified against: "Full Stock List" (the original supplier), Nishal Gems,
// S. Virvadiya and DN Green stock lists.
import * as XLSX from "xlsx";

/** Header text -> lookup key: case, spacing and punctuation don't matter ("Price $/Cts" -> "pricects"). */
const headerKey = (h: unknown) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// diamond_stock field -> header synonyms (already headerKey-normalized), in
// priority order: when a sheet has more than one, the earlier one wins
// (e.g. a real "Carat" column beats Nishal's "SIZE").
const FIELD_ALIASES: Record<string, string[]> = {
  stone_id: ["stoneid", "stockid", "stockno", "stock", "refno", "ref", "packetno", "lotno"],
  cert: ["cert", "lab"],
  report_no: ["reportno", "certnumber", "certno", "certificateno", "certificatenumber", "reportnumber"],
  shape: ["shape", "shapefull"],
  carat: ["carat", "carats", "cts", "ct", "caratweight", "weight", "size"],
  color: ["col", "color", "colour"],
  clarity: ["clarity", "purity"],
  cut: ["cut"],
  polish: ["polish", "pol"],
  symm: ["symm", "sym", "symmetry"],
  fls: ["fls", "flour", "flouresence", "flourence", "fluorescence", "flou", "flur", "fluor"],
  rate: ["rate", "percarat", "pricects", "pricepercarat", "pricect", "ratect"],
  amount: ["amount", "net", "netamount", "netvalue", "totalamount", "total"],
  measurement: ["measurement", "measurements", "measure"],
  length_mm: ["length"],
  width_mm: ["width"],
  depth_mm: ["height", "depthmm"],
  table_pct: ["table", "tablepct"],
  depth_pct: ["depth", "tdepth", "totaldepth", "depthpct"],
  ca: ["ca", "crangle", "crownangle"],
  ch: ["ch", "crheight", "crownheight"],
  pa: ["pa", "pavangle", "pavilionangle", "pavilianangle"],
  ph: ["ph", "pavheight", "pavilionheight", "paviliondepth", "paviliandepth"],
  ratio: ["ratio"],
  comments: ["comments", "comment", "remarks"],
  growth_type: ["growthtype", "growth"],
  location: ["location", "loc"],
  girdle: ["girdle"],
  culet: ["culet"],
  shade: ["shade"],
  milky: ["milky"],
  eye_clean: ["eyeclean"],
  image_link: ["imagelink", "imageurl", "image"],
  video_link: ["videolink", "videourl", "video", "imagevideo"],
  cert_link: ["certlink", "certiurl", "certilink", "certurl", "certificatelink"],
  extra: ["extra"],
  cert_stage: ["certstage"],
  price_stage: ["pricestage"],
  stone_stage: ["stonestage", "status", "available", "availability"],
};

const NUMERIC_FIELDS = new Set([
  "carat", "rate", "amount", "length_mm", "width_mm", "depth_mm",
  "table_pct", "depth_pct", "ca", "ch", "pa", "ph", "ratio",
]);

// ---------------------------------------------------------------------
// Value normalizers
// ---------------------------------------------------------------------

const GRADE_ALIASES: Record<string, string> = {
  X: "EX", EX: "EX", EXC: "EX", EXCELLENT: "EX",
  V: "VG", VG: "VG", "VERY GOOD": "VG",
  G: "GD", GD: "GD", GOOD: "GD",
  F: "FR", FR: "FR", FAIR: "FR",
  P: "PR", PR: "PR", POOR: "PR",
  I: "ID", ID: "ID", IDEAL: "ID",
};
/** Cut / polish / symmetry grade -> ID/EX/VG/GD/FR/PR. Unknown values (e.g. "8X", "-") pass through uppercased. */
export function normalizeGrade(v: string): string {
  const u = v.trim().toUpperCase().replace(/\s+/g, " ");
  return GRADE_ALIASES[u] ?? u;
}

const FLUORESCENCE_ALIASES: Record<string, string> = {
  NON: "NON", NONE: "NON", NIL: "NON", NO: "NON", N: "NON",
  FNT: "FNT", FAINT: "FNT", FA: "FNT",
  SL: "SL", SLT: "SL", SLIGHT: "SL",
  VSL: "VSL", VSLT: "VSL", "VERY SLIGHT": "VSL",
  MED: "MED", MEDIUM: "MED", M: "MED",
  STG: "STG", ST: "STG", STRONG: "STG",
  VST: "VST", VSTG: "VST", "VERY STRONG": "VST",
};
/** Fluorescence -> NON/FNT/SL/VSL/MED/STG/VST (see FLUORESCENCE_LABEL). */
export function normalizeFluorescence(v: string): string {
  const u = v.trim().toUpperCase().replace(/\s+/g, " ");
  return FLUORESCENCE_ALIASES[u] ?? u;
}

/** Shape: uppercased, single-spaced, plus known supplier typos. */
export function normalizeShape(v: string): string {
  const u = v.trim().toUpperCase().replace(/\s+/g, " ");
  return u === "TRAPAZOID" ? "TRAPEZOID" : u;
}

/**
 * Availability -> stone_stage. The catalogs only ever show "OH" (on hand),
 * so a supplier's "AVAILABLE" means OH, and their hold / memo / sold
 * statuses stay out. Unknown values pass through uppercased (and so are
 * hidden), which is the safe direction.
 */
export function normalizeStage(v: string): string {
  const u = v.trim().toUpperCase().replace(/[\s_-]+/g, "");
  if (["OH", "AVAILABLE", "AVAIL", "A", "INSTOCK", "STOCK"].includes(u)) return "OH";
  if (["ONHOLD", "HOLD", "H"].includes(u)) return "HOLD";
  return u;
}

/**
 * Certificate number -> dedupe key, so the same stone listed by two
 * suppliers is recognised even when one writes "LG823679395" and the
 * other 823679395.
 */
export function certKey(reportNo: unknown): string | null {
  if (reportNo == null) return null;
  const k = String(reportNo).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^LG/, "");
  return k.length >= 5 ? k : null;
}

/**
 * Parses the Measurement column into three numeric dimensions. Formats
 * seen: "13.83-13.97x8.61" (round: two diameters, then depth),
 * "10.00X7.00x4.5" and "6.95 x 5.19 x 3.52" (LxWxD), and Nishal's
 * "16.37 - 16.41 - 9.69" (all three dash-separated, any shape). Detected by
 * format, not shape.
 */
export function parseMeasurementDimensions(
  measurement: string | undefined
): { length: number; width: number; depth: number } | null {
  if (!measurement) return null;
  const m = measurement.trim().replace(/\s+/g, "").replace(/[×✕*]/g, "x").replace(/,/g, ".");
  const num = "(\\d+(?:\\.\\d+)?)";
  const match =
    new RegExp(`^${num}-${num}x${num}$`, "i").exec(m) ??
    new RegExp(`^${num}x${num}x${num}$`, "i").exec(m) ??
    new RegExp(`^${num}-${num}-${num}$`).exec(m);
  if (!match) return null;
  return { length: parseFloat(match[1]), width: parseFloat(match[2]), depth: parseFloat(match[3]) };
}

/** Growth method from an explicit Growth Type column, else from Comments ("CVD", or Nishal's "...Chemical Vapor Deposition (CVD)..."). */
function deriveGrowthType(growth: string | undefined, comments: string | undefined): string {
  for (const s of [growth, comments]) {
    if (!s) continue;
    if (/\bCVD\b/i.test(s)) return "CVD";
    if (/\bHPHT\b/i.test(s)) return "HPHT";
  }
  return "Other";
}

// A plain color grade or range: "E", "D", ..., "O-P". Anything else in the
// Color column ("Fancy Vivid Pink", "Light Yellow", ...) is a fancy color.
const PLAIN_COLOR_GRADE_RE = /^[D-Z](-[D-Z])?$/i;

function deriveColorMode(color: string | undefined): string | null {
  if (!color) return null;
  return PLAIN_COLOR_GRADE_RE.test(color.trim()) ? "white" : "fancy";
}

const toNumber = (raw: unknown): number | null => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim().replace(/[$,]/g, "");
  // Number(), not parseFloat: a "1.00 - 1.49" size range must not read as 1ct.
  const n = s === "" ? NaN : Number(s);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------
// Row + workbook mapping
// ---------------------------------------------------------------------

/** Column index per diamond_stock field for one sheet's header row. */
type ColumnMap = Partial<Record<string, number>>;

function mapHeaders(header: unknown[]): { columns: ColumnMap; ignored: string[] } {
  const keys = header.map(headerKey);
  const columns: ColumnMap = {};
  const used = new Set<number>();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const idx = keys.findIndex((k, i) => k === alias && !used.has(i));
      if (idx !== -1) {
        columns[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  const ignored = header
    .map((h, i) => ({ h: String(h ?? "").trim(), i }))
    .filter(({ h, i }) => h && !used.has(i))
    .map(({ h }) => h);
  return { columns, ignored };
}

const LINK_FIELDS = new Set(["image_link", "video_link", "cert_link"]);
// Proportions a grading lab never reports as 0 — a 0 here means "not measured".
const ZERO_MEANS_MISSING = new Set(["table_pct", "depth_pct", "ca", "ch", "pa", "ph", "ratio", "length_mm", "width_mm", "depth_mm"]);
const isUrl = (v: unknown) => /^https?:\/\//i.test(String(v ?? "").trim());

/**
 * Maps one sheet row to a diamond_stock insert row, or null if it lacks
 * Shape, Carat, or both Rate and Amount. `links` holds each cell's Excel
 * hyperlink target, if any — some suppliers put a clickable label
 * ("Image/Video") or a clickable certificate number instead of a URL.
 */
export function sheetRowToStockRow(
  cells: unknown[],
  columns: ColumnMap,
  links: (string | undefined)[] = []
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};

  for (const [field, idx] of Object.entries(columns)) {
    let raw = cells[idx!];
    if (LINK_FIELDS.has(field) && !isUrl(raw)) raw = isUrl(links[idx!]) ? links[idx!] : null;
    if (raw == null || raw === "") continue;
    if (NUMERIC_FIELDS.has(field)) {
      const n = toNumber(raw);
      if (n != null && !(n === 0 && ZERO_MEANS_MISSING.has(field))) out[field] = n;
    } else {
      const s = String(raw).trim();
      if (s) out[field] = s;
    }
  }
  if (!out.cert_link && columns.report_no != null && isUrl(links[columns.report_no])) {
    out.cert_link = links[columns.report_no];
  }
  if (!out.cert && typeof out.cert_link === "string") {
    if (/igi\.org/i.test(out.cert_link)) out.cert = "IGI";
    else if (/gia\.edu/i.test(out.cert_link)) out.cert = "GIA";
  }

  if (typeof out.shape === "string") out.shape = normalizeShape(out.shape);
  for (const f of ["cut", "polish", "symm"]) {
    if (typeof out[f] === "string") out[f] = normalizeGrade(out[f] as string);
  }
  if (typeof out.fls === "string") out.fls = normalizeFluorescence(out.fls);
  if (typeof out.clarity === "string") out.clarity = out.clarity.toUpperCase();
  if (typeof out.cert === "string") out.cert = out.cert.toUpperCase();
  if (typeof out.color === "string" && PLAIN_COLOR_GRADE_RE.test(out.color)) out.color = out.color.toUpperCase();
  out.stone_stage = typeof out.stone_stage === "string" ? normalizeStage(out.stone_stage) : "OH";

  const carat = out.carat as number | undefined;
  if (!out.shape || carat == null || carat <= 0) return null;
  // Suppliers give per-carat rate, total amount, or both; derive whichever is missing.
  if (out.rate == null && out.amount == null) return null;
  if (out.amount == null) out.amount = (out.rate as number) * carat;
  if (out.rate == null) out.rate = (out.amount as number) / carat;

  // Dimensions: from the Measurement string, or separate Length/Width/Height
  // columns (then a Measurement string is synthesized for display).
  const dims = parseMeasurementDimensions(out.measurement as string | undefined);
  if (dims) {
    out.length_mm = dims.length;
    out.width_mm = dims.width;
    out.depth_mm = dims.depth;
    // Nishal-style "L - W - D" is rewritten to the "LxWxD" form the rest of
    // the app (e.g. lib/cad-stock.ts's diameter parser) already understands.
    if (/^\s*[\d.]+\s*-\s*[\d.]+\s*-\s*[\d.]+\s*$/.test(out.measurement as string)) {
      out.measurement = `${dims.length.toFixed(2)}x${dims.width.toFixed(2)}x${dims.depth.toFixed(2)}`;
    }
  } else if (out.length_mm != null && out.width_mm != null && out.depth_mm != null) {
    out.measurement = `${(out.length_mm as number).toFixed(2)}x${(out.width_mm as number).toFixed(2)}x${(out.depth_mm as number).toFixed(2)}`;
  }

  out.growth_type = deriveGrowthType(out.growth_type as string | undefined, out.comments as string | undefined);
  out.color_mode = deriveColorMode(out.color as string | undefined);
  out.cert_key = certKey(out.report_no);

  return out;
}

const HEADER_SCAN_ROWS = 15;
const MIN_HEADER_FIELDS = 4;

export type ParsedStock = {
  rows: Record<string, unknown>[];
  /** Data rows that couldn't become a stone (no shape / carat / price). */
  skipped: number;
  sheetName: string;
  /** Sheet header text that didn't match any known field — shown after upload so a new supplier format can be checked. */
  ignoredHeaders: string[];
  /** Important fields this sheet had no column for. */
  missingFields: string[];
};

const IMPORTANT_FIELDS = ["stone_id", "report_no", "color", "clarity", "measurement", "cert"];

/**
 * Finds the stock table in a workbook — the sheet (and header row within
 * it, allowing for title rows above) whose header maps to the most known
 * fields and includes Shape and Carat — and maps every data row.
 */
export function parseStockWorkbook(workbook: XLSX.WorkBook): ParsedStock | { error: string } {
  let best: { sheetName: string; headerRow: number; columns: ColumnMap; ignored: string[]; table: unknown[][]; score: number } | null = null;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) continue;
    // blankrows: true keeps table[i] aligned with sheet row (range start + i), for hyperlink lookup.
    const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: true });
    for (let r = 0; r < Math.min(HEADER_SCAN_ROWS, table.length); r++) {
      const { columns, ignored } = mapHeaders(table[r] ?? []);
      const score = Object.keys(columns).length;
      if (columns.shape == null || columns.carat == null || score < MIN_HEADER_FIELDS) continue;
      // Prefer the richer header; on a tie, the sheet with more rows.
      if (!best || score > best.score || (score === best.score && table.length > best.table.length)) {
        best = { sheetName, headerRow: r, columns, ignored, table, score };
      }
    }
  }

  if (!best) {
    return { error: "Couldn't find a stock table in this file — no sheet has a header row with Shape and Carat (or Size/Cts) columns." };
  }
  if (best.columns.rate == null && best.columns.amount == null) {
    return { error: `Sheet "${best.sheetName}" has no price column (looked for Rate, Per Carat, Price $/Cts, Amount, Net).` };
  }

  const sheet = workbook.Sheets[best.sheetName];
  const origin = XLSX.utils.decode_range(sheet["!ref"]!).s;
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (let r = best.headerRow + 1; r < best.table.length; r++) {
    const cells = best.table[r];
    if (!cells || cells.every((c) => c == null || c === "")) continue;
    const links = cells.map((_, c) => (sheet[XLSX.utils.encode_cell({ r: origin.r + r, c: origin.c + c })] as XLSX.CellObject | undefined)?.l?.Target);
    const row = sheetRowToStockRow(cells, best.columns, links);
    if (row) rows.push(row);
    else skipped++;
  }

  const hasDims = best.columns.length_mm != null && best.columns.width_mm != null && best.columns.depth_mm != null;
  const missingFields = IMPORTANT_FIELDS.filter((f) => best!.columns[f] == null && !(f === "measurement" && hasDims));

  return { rows, skipped, sheetName: best.sheetName, ignoredHeaders: best.ignored, missingFields };
}
