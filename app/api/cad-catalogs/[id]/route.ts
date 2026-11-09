import type { Document } from "mongodb";
import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb, newId, serialize } from "@/lib/mongo";
import { getCadDesignById } from "@/lib/cad-designs";
import { cadCatalogItemFilter, cadCatalogSettings, validateCadCatalog, type CadCatalogInput } from "@/lib/cad-catalog";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const db = await getDb();
  const catalog = await db.collection<Document & { _id: string }>("cad_catalogs").findOne({ _id: params.id });
  if (!catalog) return NextResponse.json({ error: "Catalog not found." }, { status: 404 });
  const items = await db.collection<Document & { _id: string }>("cad_catalog_items").find(cadCatalogItemFilter(catalog)).sort({ display_order: 1 }).toArray();
  return NextResponse.json({
    catalog: serialize(catalog),
    // Retain stored designs even if they have since left the CAD library.
    items: items.map((item) => ({ ...serialize(item), tags: getCadDesignById(item.design_id)?.tags ?? [] })),
  });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const body: CadCatalogInput & { revision?: string | null } = await request.json();
  const error = validateCadCatalog(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const db = await getDb();
  const catalogs = db.collection<Document & { _id: string }>("cad_catalogs");
  const catalog = await catalogs.findOne({ _id: params.id });
  if (!catalog) return NextResponse.json({ error: "Catalog not found." }, { status: 404 });
  if ((body.revision ?? null) !== (catalog.item_revision ?? null)) {
    return NextResponse.json({ error: "This catalog was edited elsewhere. Reload it before saving your changes." }, { status: 409 });
  }

  const revision = newId();
  const items = db.collection<Document & { _id: string }>("cad_catalog_items");
  const now = new Date();
  const rows = body.items.map((item, i) => ({
    _id: newId(),
    catalog_id: catalog._id,
    item_revision: revision,
    design_id: item.design_id,
    dataset: item.dataset,
    collection: item.collection,
    design_code: item.design_code,
    design_type: item.design_type,
    cad_url: item.cad_url,
    display_order: i,
    prices: item.prices,
    created_at: now,
  }));
  try {
    // Stage all items before atomically switching the catalog to this revision.
    // The old selection remains usable if insertion or the update fails.
    await items.insertMany(rows);
    const result = await catalogs.updateOne(
      { _id: catalog._id, item_revision: catalog.item_revision ?? { $exists: false } },
      { $set: { ...cadCatalogSettings(body), item_revision: revision, updated_at: now } }
    );
    if (!result.matchedCount) {
      await items.deleteMany({ catalog_id: catalog._id, item_revision: revision });
      return NextResponse.json({ error: "This catalog was edited elsewhere. Reload it before saving your changes." }, { status: 409 });
    }
  } catch {
    await items.deleteMany({ catalog_id: catalog._id, item_revision: revision });
    return NextResponse.json({ error: "Could not save the catalog. Your previous catalog is unchanged." }, { status: 500 });
  }
  // Keep superseded revisions for a day for readers that fetched the catalog
  // just before the switch. Cleanup never touches active or staged items.
  await items.updateMany(cadCatalogItemFilter(catalog), { $set: { superseded_at: now } }).catch(() => {});
  await items.deleteMany({
    catalog_id: catalog._id,
    superseded_at: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
  }).catch(() => {});
  return NextResponse.json({ ok: true, revision });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { status } = await request.json();
  if (status !== "active" && status !== "archived") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const db = await getDb();
  const result = await db.collection<Document & { _id: string }>("cad_catalogs").updateOne({ _id: params.id }, { $set: { status } });
  if (!result.matchedCount) return NextResponse.json({ error: "Catalog not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
