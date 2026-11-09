import type { Document } from "mongodb";
import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb, newId, newShareCode, serialize } from "@/lib/mongo";
import { cadCatalogSettings, validateCadCatalog, type CadCatalogInput } from "@/lib/cad-catalog";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const db = await getDb();
  const [catalogs, counts] = await Promise.all([
    db.collection<Document & { _id: string }>("cad_catalogs").find({}).sort({ created_at: -1 }).toArray(),
    db.collection<Document & { _id: string }>("cad_catalog_items").aggregate([{ $group: { _id: { catalog_id: "$catalog_id", revision: { $ifNull: ["$item_revision", ""] } }, n: { $sum: 1 } } }]).toArray(),
  ]);
  const countById = new Map(counts.map((c) => [`${c._id.catalog_id}:${c._id.revision}`, c.n as number]));
  return NextResponse.json({
    catalogs: catalogs.map((c) => ({ ...serialize(c), item_count: countById.get(`${c._id}:${c.item_revision ?? ""}`) ?? 0 })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const b: CadCatalogInput = await request.json();
  const error = validateCadCatalog(b);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const db = await getDb();
  const catalog = {
    _id: newId(),
    code: newShareCode(),
    ...cadCatalogSettings(b),
    status: "active",
    created_by: user.id,
    created_at: new Date(),
  };
  await db.collection<Document & { _id: string }>("cad_catalogs").insertOne(catalog);

  const now = new Date();
  const items = b.items.map((it, i) => ({
    _id: newId(),
    catalog_id: catalog._id,
    design_id: it.design_id,
    dataset: it.dataset,
    collection: it.collection,
    design_code: it.design_code,
    design_type: it.design_type,
    cad_url: it.cad_url,
    display_order: i,
    prices: it.prices,
    created_at: now,
  }));
  try {
    await db.collection<Document & { _id: string }>("cad_catalog_items").insertMany(items);
  } catch (e) {
    await db.collection<Document & { _id: string }>("cad_catalog_items").deleteMany({ catalog_id: catalog._id });
    await db.collection<Document & { _id: string }>("cad_catalogs").deleteOne({ _id: catalog._id });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ catalog: serialize(catalog) });
}
