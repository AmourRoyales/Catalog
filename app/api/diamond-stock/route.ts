import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/mongo";

// Stats only (row count + last import date) for the admin upload page.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const db = await getDb();
  const col = db.collection("diamond_stock");
  const [count, latest] = await Promise.all([
    col.estimatedDocumentCount(),
    col.find({}, { projection: { imported_at: 1 } }).sort({ imported_at: -1 }).limit(1).toArray(),
  ]);

  return NextResponse.json({ count, lastImportedAt: latest[0]?.imported_at ?? null });
}

// Removes EVERY stone. Public diamond catalogs are live filters over this
// collection, so they show empty until new stock is uploaded.
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const db = await getDb();
  const { deletedCount } = await db.collection("diamond_stock").deleteMany({});
  return NextResponse.json({ deleted: deletedCount });
}
