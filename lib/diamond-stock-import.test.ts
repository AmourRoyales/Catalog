import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  certKey, normalizeFluorescence, normalizeGrade, normalizeStage, parseMeasurementDimensions, parseStockWorkbook,
} from "./diamond-stock-import";

const workbook = (sheets: Record<string, unknown[][]>) => {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return wb;
};

const parse = (sheets: Record<string, unknown[][]>) => {
  const res = parseStockWorkbook(workbook(sheets));
  if ("error" in res) throw new Error(res.error);
  return res;
};

describe("value normalizers", () => {
  it.each([["X", "EX"], ["Excellent", "EX"], ["v", "VG"], ["FAIR", "FR"], ["ID", "ID"], ["8X", "8X"], ["-", "-"]])(
    "grade %s -> %s", (raw, want) => expect(normalizeGrade(raw)).toBe(want)
  );
  it.each([["None", "NON"], ["nil", "NON"], ["Very Slight", "VSL"], ["SLT", "SL"], ["STG", "STG"]])(
    "fluorescence %s -> %s", (raw, want) => expect(normalizeFluorescence(raw)).toBe(want)
  );
  it.each([["AVAILABLE", "OH"], ["OH", "OH"], ["ONHOLD", "HOLD"], ["On Hold", "HOLD"], ["MEMO", "MEMO"]])(
    "stage %s -> %s", (raw, want) => expect(normalizeStage(raw)).toBe(want)
  );
  it("cert key ignores an LG prefix and number/string form", () => {
    expect(certKey("LG823679395")).toBe("823679395");
    expect(certKey(823679395)).toBe("823679395");
    expect(certKey("")).toBeNull();
  });
  it.each([
    ["13.83-13.97x8.61", [13.83, 13.97, 8.61]],
    ["10.00X7.00x4.5", [10, 7, 4.5]],
    ["  6.95 x  5.19 x  3.52", [6.95, 5.19, 3.52]],
    ["16.37 - 16.41 - 9.69", [16.37, 16.41, 9.69]],
  ])("measurement %s", (raw, [length, width, depth]) =>
    expect(parseMeasurementDimensions(raw)).toEqual({ length, width, depth })
  );
});

describe("parseStockWorkbook", () => {
  it("maps the original 'Full Stock List' layout", () => {
    const res = parse({
      Sheet1: [
        ["Location", "Stone ID", "Cert", "Shape", "Carat", "Col", "Clarity", "Cut", "Polish", "Symm", "Fls", "Rate", "Amount", "Measurement", "Report No", "Comments", "Stone Stage"],
        ["MUMBAI", "134957-A", "IGI", "round", 10.02, "E", "VVS2", "EX", "EX", "EX", "NON", 246.98, 2474.74, "13.99-14.05x8.34", "774654012", "CVD", "OH"],
      ],
      Sheet2: [["notes"]],
    });
    expect(res.ignoredHeaders).toEqual([]);
    expect(res.rows[0]).toMatchObject({
      stone_id: "134957-A", cert: "IGI", shape: "ROUND", carat: 10.02, rate: 246.98, amount: 2474.74,
      length_mm: 13.99, width_mm: 14.05, depth_mm: 8.34, growth_type: "CVD", stone_stage: "OH", cert_key: "774654012",
    });
  });

  it("maps Nishal Gems' layout (SIZE / PURITY / PER CARAT / NET$ / AVAILABLE)", () => {
    const res = parse({
      TempData: [
        ["NO", "STOCK", "AVAILABLE", "LOCATION", "SHAPE", "SIZE", "SIZE RANGE", "COLOR", "PURITY", "CUT", "POLISH", "SYM", "FLOU", "MEASUREMENT", "LAB", "PER CARAT", "NET$", "CERT NUMBER", "GROWTHTYPE", "CROWN HEIGHT", "PAVILIAN DEPTH"],
        [1, "ANG-01-61", "AVAILABLE", "USA", "ROUND", 16, "15.00 - 19.99", "F", "VS1", "ID", "EX", "EX", "None", "16.37 - 16.41 - 9.69", "IGI", 526.05, 8416.8, 774659088, "CVD", 13, 42.5],
        [2, "NGT-1", "ONHOLD", "INDIA", "PEAR", 2, "2.00 - 2.99", "D", "VVS2", null, "VG", "VG", "Very Slight", "12 - 8 - 5", "IGI", 100, 200, 123456789, "HPHT", 13, 42.5],
      ],
    });
    expect(res.ignoredHeaders).toEqual(["NO", "SIZE RANGE"]);
    expect(res.rows[0]).toMatchObject({
      stone_id: "ANG-01-61", carat: 16, clarity: "VS1", rate: 526.05, amount: 8416.8, fls: "NON",
      report_no: "774659088", measurement: "16.37x16.41x9.69", length_mm: 16.37, ch: 13, ph: 42.5, stone_stage: "OH",
    });
    expect(res.rows[1]).toMatchObject({ stone_stage: "HOLD", fls: "VSL", growth_type: "HPHT" });
  });

  it("finds a header below title rows, derives amount from rate and dims from L/W/H columns", () => {
    const res = parse({
      Stock: [
        ["DN GREEN STOCK"],
        [],
        ["Stone ID", "Shape", "Carats", "Color", "Clarity", "Price $/Cts", "Length", "Width", "Height", "CrAngle", "Cert. No"],
        ["DNG-1", "TRILLIANT ", 1.01, "D", "VS1", 115, 6.75, 7, 3.93, 0, "LG765630936"],
      ],
    });
    expect(res.rows[0]).toMatchObject({ shape: "TRILLIANT", amount: 116.15, measurement: "6.75x7.00x3.93", cert_key: "765630936" });
    expect(res.rows[0].ca).toBeUndefined(); // 0 angle = not measured
  });

  it("skips rows without a usable carat or price, and never reads a size range as a carat", () => {
    const res = parse({
      S: [
        ["Shape", "Size", "Color", "Rate"],
        ["ROUND", "1.00 - 1.49", "D", 100],
        ["ROUND", 1.2, "D", null],
        ["ROUND", 1.2, "D", 100],
      ],
    });
    expect(res.rows).toHaveLength(1);
    expect(res.skipped).toBe(2);
  });

  it("errors clearly when no sheet looks like a stock list", () => {
    expect(parseStockWorkbook(workbook({ S: [["Name", "Phone"], ["a", "b"]] }))).toHaveProperty("error");
  });
});
