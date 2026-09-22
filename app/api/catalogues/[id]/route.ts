import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb, serialize } from "@/lib/mongo";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const doc = await (await getDb()).collection("catalogues").findOne({ _id: params.id as any });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ catalogue: serialize(doc) });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const b = await request.json();
  if (typeof b.name !== "string" || !b.name.trim() || !Array.isArray(b.products) || b.products.length === 0) {
    return NextResponse.json({ error: "Name and at least one product are required." }, { status: 400 });
  }
  await (await getDb()).collection("catalogues").updateOne(
    { _id: params.id as any },
    {
      $set: {
        name: b.name.trim(),
        show_price: !!b.show_price,
        show_description: !!b.show_description,
        show_branding: !!b.show_branding,
        catalogue_products: (b.products as { product_id: string; price_override: number | null }[]).map((p, i) => ({
          product_id: p.product_id,
          display_order: i,
          price_override: p.price_override ?? null,
        })),
      },
    }
  );
  return NextResponse.json({ ok: true });
}

// Either { status } or { price_overrides: { [productId]: price } } (bulk price upload).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const b = await request.json();
  const col = (await getDb()).collection("catalogues");

  if (b.status !== undefined) {
    if (b.status !== "active" && b.status !== "archived") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    await col.updateOne({ _id: params.id as any }, { $set: { status: b.status } });
    return NextResponse.json({ ok: true });
  }

  if (b.price_overrides && typeof b.price_overrides === "object") {
    const doc = await col.findOne({ _id: params.id as any });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const overrides = b.price_overrides as Record<string, number>;
    const updatedIds: string[] = [];
    const links = (doc.catalogue_products ?? []).map((cp: { product_id: string; price_override: number | null }) => {
      if (cp.product_id in overrides) {
        updatedIds.push(cp.product_id);
        return { ...cp, price_override: overrides[cp.product_id] };
      }
      return cp;
    });
    await col.updateOne({ _id: params.id as any }, { $set: { catalogue_products: links } });
    return NextResponse.json({ updatedIds });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}
