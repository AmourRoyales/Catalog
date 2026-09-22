import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb, newId, newShareCode, serialize } from "@/lib/mongo";
import { countDiamondStock, type DiamondFilters } from "@/lib/diamond-stock-query";

// Saved diamond catalogs with a LIVE match count (computed from current stock, not stored).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const db = await getDb();
  const catalogs = await db.collection("diamond_catalogs").find({}).sort({ created_at: -1 }).toArray();

  const withCounts = await Promise.all(
    catalogs.map(async (c) => ({
      ...serialize(c),
      matchCount: await countDiamondStock((c.filters ?? {}) as DiamondFilters),
    }))
  );
  return NextResponse.json({ catalogs: withCounts });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const b = await request.json();
  if (typeof b.name !== "string" || !b.name.trim()) {
    return NextResponse.json({ error: "Catalog name is required." }, { status: 400 });
  }
  const db = await getDb();
  const doc = {
    _id: newId() as any,
    code: newShareCode(),
    name: b.name.trim(),
    filters: b.filters ?? {},
    show_price: b.show_price !== false,
    show_branding: b.show_branding !== false,
    status: "active",
    created_by: user.id,
    created_at: new Date(),
  };
  await db.collection("diamond_catalogs").insertOne(doc);
  return NextResponse.json({ catalog: serialize(doc) });
}
