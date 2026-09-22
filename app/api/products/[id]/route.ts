import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb, newId, serialize, isDuplicateKeyError } from "@/lib/mongo";

type MediaIn = { media_type: string; file_url: string; r2_key: string };
type StoredMedia = { id: string; media_type: string; file_url: string; r2_key: string; sort_order: number };

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const doc = await (await getDb()).collection("products").findOne({ _id: params.id as any });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ product: serialize(doc) });
}

// `keep_media_ids` is the ordered list of existing media to retain (anything
// else is dropped); `new_media` is appended after them.
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const b = await request.json();
  const col = (await getDb()).collection("products");
  const existing = await col.findOne({ _id: params.id as any });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const byId = new Map<string, StoredMedia>((existing.product_media ?? []).map((m: StoredMedia) => [m.id, m]));
  const kept = ((b.keep_media_ids ?? []) as string[]).map((id) => byId.get(id)).filter((m): m is StoredMedia => !!m);
  const added = ((b.new_media ?? []) as MediaIn[]).map((m) => ({ id: newId(), ...m }));
  const product_media = [...kept, ...added].map((m, i) => ({ ...m, sort_order: i }));

  try {
    await col.updateOne(
      { _id: params.id as any },
      {
        $set: {
          product_code: String(b.product_code ?? "").trim(),
          name: String(b.name ?? "").trim(),
          category: b.category,
          subcategory: b.subcategory ?? null,
          stone_shape: b.stone_shape ?? null,
          price: b.price ?? null,
          description: b.description ?? null,
          status: b.status,
          product_media,
        },
      }
    );
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      return NextResponse.json({ error: `Product code "${b.product_code}" already exists.` }, { status: 409 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const db = await getDb();
  await db.collection("products").deleteOne({ _id: params.id as any });
  // Drop it from any catalogue that referenced it.
  await db.collection("catalogues").updateMany({}, { $pull: { catalogue_products: { product_id: params.id } } as any });
  return NextResponse.json({ ok: true });
}
