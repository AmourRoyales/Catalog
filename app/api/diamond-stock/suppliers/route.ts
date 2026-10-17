import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb, isDuplicateKeyError, newId } from "@/lib/mongo";
import type { SupplierDoc } from "@/lib/diamond-suppliers";

// Adds a supplier. Their sheet layout doesn't need configuring — the import
// recognises columns by header name (see lib/diamond-stock-import.ts).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { name } = (await request.json()) as { name?: string };
  const trimmed = name?.trim().replace(/\s+/g, " ");
  if (!trimmed) return NextResponse.json({ error: "Supplier name is required." }, { status: 400 });

  const doc: SupplierDoc = { _id: newId(), name: trimmed, created_at: new Date() };
  try {
    await (await getDb()).collection<SupplierDoc>("diamond_suppliers").insertOne(doc);
  } catch (e) {
    if (isDuplicateKeyError(e)) return NextResponse.json({ error: `A supplier named "${trimmed}" already exists.` }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ id: doc._id, name: doc.name });
}
