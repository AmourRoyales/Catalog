import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb, newId, newShareCode, serialize } from "@/lib/mongo";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const db = await getDb();
  const [catalogs, counts] = await Promise.all([
    db.collection("cad_catalogs").find({}).sort({ created_at: -1 }).toArray(),
    db.collection("cad_catalog_items").aggregate([{ $group: { _id: "$catalog_id", n: { $sum: 1 } } }]).toArray(),
  ]);
  const countById = new Map(counts.map((c) => [String(c._id), c.n as number]));
  return NextResponse.json({
    catalogs: catalogs.map((c) => ({ ...serialize(c), item_count: countById.get(String(c._id)) ?? 0 })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const b = await request.json();
  if (typeof b.name !== "string" || !b.name.trim() || !Array.isArray(b.metals) || !Array.isArray(b.items) || b.items.length === 0) {
    return NextResponse.json({ error: "Name, metals and at least one design are required." }, { status: 400 });
  }

  const db = await getDb();
  const catalog = {
    _id: newId() as any,
    code: newShareCode(),
    name: b.name.trim(),
    metals: b.metals,
    category: b.category,
    extra_percent: Number(b.extra_percent) || 0,
    show_price: b.show_price !== false,
    show_branding: b.show_branding !== false,
    status: "active",
    created_by: user.id,
    created_at: new Date(),
  };
  await db.collection("cad_catalogs").insertOne(catalog);

  const now = new Date();
  const items = b.items.map((it: Record<string, unknown>) => ({
    _id: newId(),
    catalog_id: catalog._id,
    design_id: it.design_id,
    dataset: it.dataset,
    collection: it.collection,
    design_code: it.design_code,
    design_type: it.design_type,
    cad_url: it.cad_url,
    display_order: it.display_order,
    prices: it.prices,
    created_at: now,
  }));
  try {
    await db.collection("cad_catalog_items").insertMany(items);
  } catch (e) {
    await db.collection("cad_catalogs").deleteOne({ _id: catalog._id });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ catalog: serialize(catalog) });
}
