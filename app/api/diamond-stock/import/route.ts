import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { parseStockWorkbook } from "@/lib/diamond-stock-import";
import { dedupeAgainstStock, uniqueByCert, type SupplierDoc } from "@/lib/diamond-suppliers";
import { priceStockRowForStorage } from "@/lib/diamond-pricing";
import { PRICING_VERSION, bumpStockVersion } from "@/lib/diamond-stock-query";
import { carryOverMediaChecks, mediaRank } from "@/lib/media-check";

const INSERT_BATCH_SIZE = 500;

// Replaces ONE supplier's stones with the uploaded sheet. Other suppliers'
// stock is left as is, except that each stone (certificate number) is only
// ever stored once — where two suppliers list the same stone, the better
// copy (available, then cheaper) is kept and the other is not stored.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const form = await request.formData();
  const file = form.get("file");
  const supplierId = form.get("supplierId");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (typeof supplierId !== "string" || !supplierId) {
    return NextResponse.json({ error: "Choose which supplier this stock list is from." }, { status: 400 });
  }

  const db = await getDb();
  const supplier = await db.collection<SupplierDoc>("diamond_suppliers").findOne({ _id: supplierId });
  if (!supplier) return NextResponse.json({ error: "Supplier not found." }, { status: 404 });

  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const parsed = parseStockWorkbook(workbook);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const inFile = uniqueByCert(parsed.rows);
  const { rows: unique, skipped: duplicatesSkipped, displaceIds } = await dedupeAgainstStock(db, supplier._id, inFile.rows);

  // Same photo/video links as last time: reuse those check results.
  await carryOverMediaChecks(db, unique);

  const batchId = randomUUID();
  const importedAt = new Date();
  const rows = unique.map((r) => ({
    ...r,
    ...priceStockRowForStorage({
      rate: Number(r.rate),
      amount: Number(r.amount),
      carat: Number(r.carat),
      color: String(r.color ?? ""),
      clarity: String(r.clarity ?? ""),
    }),
    pricing_version: PRICING_VERSION,
    // Provisional until the media check (lib/media-check.ts) has run.
    media_rank: mediaRank(r),
    supplier_id: supplier._id,
    supplier_name: supplier.name,
    batch_id: batchId,
    imported_at: importedAt,
  }));

  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: `No valid rows found in sheet "${parsed.sheetName}" (every stone needs a shape, carat and price).` },
      { status: 400 }
    );
  }

  const col = db.collection("diamond_stock");

  // Insert the new batch first; only delete this supplier's old batch (and
  // other suppliers' copies this upload beats) once every new chunk lands,
  // so a failed import leaves the previous stock untouched.
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    try {
      await col.insertMany(rows.slice(i, i + INSERT_BATCH_SIZE));
    } catch (e) {
      await col.deleteMany({ batch_id: batchId });
      return NextResponse.json(
        { error: `Import failed at row ${i}: ${(e as Error).message}. ${supplier.name}'s previous stock list is unchanged.` },
        { status: 500 }
      );
    }
  }

  const { deletedCount: replaced } = await col.deleteMany({ supplier_id: supplier._id, batch_id: { $ne: batchId } });
  const { deletedCount: displaced } = displaceIds.length
    ? await col.deleteMany({ _id: { $in: displaceIds } })
    : { deletedCount: 0 };

  await bumpStockVersion(db);

  return NextResponse.json({
    imported: rows.length,
    skipped: parsed.skipped,
    replaced,
    onHand: unique.filter((r) => r.stone_stage === "OH").length,
    duplicatesInFile: inFile.dropped,
    duplicatesSkipped,
    displaced,
    sheetName: parsed.sheetName,
    ignoredHeaders: parsed.ignoredHeaders,
    missingFields: parsed.missingFields,
  });
}
