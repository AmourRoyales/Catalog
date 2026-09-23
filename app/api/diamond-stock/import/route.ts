import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { excelRowToStockRow } from "@/lib/cad-stock";
import { priceStockRowForStorage } from "@/lib/diamond-pricing";

const INSERT_BATCH_SIZE = 500;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = workbook.Sheets["Sheet1"] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    return NextResponse.json({ error: "No sheet found in the file" }, { status: 400 });
  }

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
  const batchId = randomUUID();
  const rows = rawRows
    .map((row) => excelRowToStockRow(row, batchId))
    .filter((r): r is Record<string, unknown> => r !== null)
    .map((r) => {
      // Amount isn't a required Excel column (only Shape/Carat/Rate are) —
      // fall back to rate × carat so pricing always has a landed cost to work from.
      const carat = Number(r.carat);
      const amount = typeof r.amount === "number" ? r.amount : Number(r.rate) * carat;
      const pricing = priceStockRowForStorage({
        rate: Number(r.rate),
        amount,
        carat,
        color: String(r.color ?? ""),
        clarity: String(r.clarity ?? ""),
      });
      return { ...r, ...pricing };
    });

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found (need Shape, Carat and Rate on every row)." },
      { status: 400 }
    );
  }

  const col = (await getDb()).collection("diamond_stock");
  const importedAt = new Date();

  // Insert the new batch first; only delete the old batch once every new
  // chunk lands, so diamond_stock is never briefly empty and a failed
  // import leaves the previous stock list untouched.
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + INSERT_BATCH_SIZE).map((r) => ({ ...r, imported_at: importedAt }));
    try {
      await col.insertMany(chunk);
    } catch (e) {
      await col.deleteMany({ batch_id: batchId });
      return NextResponse.json(
        { error: `Import failed at row ${i}: ${(e as Error).message}. Previous stock list is unchanged.` },
        { status: 500 }
      );
    }
  }

  await col.deleteMany({ batch_id: { $ne: batchId } });

  return NextResponse.json({ imported: rows.length, skipped: rawRows.length - rows.length });
}
