import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { getSupplierStats, type SupplierDoc } from "@/lib/diamond-suppliers";

// Stats (total + per supplier) for the admin upload page.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const suppliers = await getSupplierStats(await getDb());
  const lastImportedAt = suppliers.reduce<Date | null>(
    (latest, s) => (s.lastImportedAt && (!latest || s.lastImportedAt > latest) ? s.lastImportedAt : latest),
    null
  );
  return NextResponse.json({
    count: suppliers.reduce((n, s) => n + s.count, 0),
    lastImportedAt,
    suppliers,
  });
}

// ?supplier=<id> removes that supplier's stones; ?supplier=unassigned the
// pre-supplier ones; no parameter removes EVERY stone. Public diamond
// catalogs are live filters over this collection, so removed stones vanish
// from them immediately.
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const supplier = new URL(request.url).searchParams.get("supplier");
  const filter = !supplier ? {} : supplier === "unassigned" ? { supplier_id: { $exists: false } } : { supplier_id: supplier };

  const db = await getDb();
  const { deletedCount } = await db.collection("diamond_stock").deleteMany(filter);
  return NextResponse.json({ deleted: deletedCount });
}

// { assignUnassignedTo: supplierId } — moves the pre-supplier stones under a
// supplier, so the next upload for that supplier replaces them.
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { assignUnassignedTo } = (await request.json()) as { assignUnassignedTo?: string };
  const db = await getDb();
  const supplier = assignUnassignedTo
    ? await db.collection<SupplierDoc>("diamond_suppliers").findOne({ _id: assignUnassignedTo })
    : null;
  if (!supplier) return NextResponse.json({ error: "Supplier not found." }, { status: 404 });

  const { modifiedCount } = await db
    .collection("diamond_stock")
    .updateMany({ supplier_id: { $exists: false } }, { $set: { supplier_id: supplier._id, supplier_name: supplier.name } });
  return NextResponse.json({ assigned: modifiedCount });
}
