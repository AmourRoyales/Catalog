import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb, newId, newShareCode, serialize } from "@/lib/mongo";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const docs = await (await getDb()).collection("catalogues").find({}).sort({ created_at: -1 }).toArray();
  return NextResponse.json({
    catalogues: docs.map(({ catalogue_products, ...c }) => ({
      ...serialize(c),
      product_count: (catalogue_products ?? []).length,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const b = await request.json();
  if (typeof b.name !== "string" || !b.name.trim() || !Array.isArray(b.product_ids) || b.product_ids.length === 0) {
    return NextResponse.json({ error: "Name and at least one product are required." }, { status: 400 });
  }
  const doc = {
    _id: newId() as any,
    share_token: newShareCode(),
    name: b.name.trim(),
    show_price: b.show_price !== false,
    show_description: b.show_description !== false,
    show_branding: b.show_branding !== false,
    status: "active",
    created_by: user.id,
    created_at: new Date(),
    catalogue_products: (b.product_ids as string[]).map((product_id, i) => ({
      product_id,
      display_order: i,
      price_override: null,
    })),
  };
  await (await getDb()).collection("catalogues").insertOne(doc);
  return NextResponse.json({ catalogue: serialize(doc) });
}
