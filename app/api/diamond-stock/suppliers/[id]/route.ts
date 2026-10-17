import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import type { SupplierDoc } from "@/lib/diamond-suppliers";

// Removes a supplier together with all of their stones.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const db = await getDb();
  const { deletedCount } = await db.collection<SupplierDoc>("diamond_suppliers").deleteOne({ _id: params.id });
  if (!deletedCount) return NextResponse.json({ error: "Supplier not found." }, { status: 404 });

  const { deletedCount: stones } = await db.collection("diamond_stock").deleteMany({ supplier_id: params.id });
  return NextResponse.json({ deleted: stones });
}
