import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb, newId, serialize, isDuplicateKeyError } from "@/lib/mongo";

type MediaIn = { media_type: string; file_url: string; r2_key: string };

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const status = new URL(request.url).searchParams.get("status");
  const db = await getDb();
  const docs = await db
    .collection("products")
    .find(status ? { status } : {})
    .sort({ created_at: -1 })
    .toArray();
  return NextResponse.json({ products: docs.map((d) => serialize(d)) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const b = await request.json();
  const media: MediaIn[] = Array.isArray(b.media) ? b.media : [];
  const doc = {
    _id: newId() as any,
    product_code: String(b.product_code ?? "").trim(),
    name: String(b.name ?? "").trim(),
    category: b.category,
    subcategory: b.subcategory ?? null,
    stone_shape: b.stone_shape ?? null,
    price: b.price ?? null,
    description: b.description ?? null,
    status: b.status ?? "active",
    created_by: user.id,
    created_at: new Date(),
    product_media: media.map((m, i) => ({
      id: newId(),
      media_type: m.media_type,
      file_url: m.file_url,
      r2_key: m.r2_key,
      sort_order: i,
    })),
  };

  try {
    await (await getDb()).collection("products").insertOne(doc);
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      return NextResponse.json({ error: `Product code "${doc.product_code}" already exists.` }, { status: 409 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ product: serialize(doc) });
}
