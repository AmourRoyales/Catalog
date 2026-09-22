// One-time data copy: Supabase (REST, service role) -> MongoDB.
// Usage: node --env-file=.env scripts/migrate-from-supabase.mjs
// Safe to re-run: small collections are upserted by id; diamond_stock is replaced.
import { MongoClient } from "mongodb";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) throw new Error("Supabase env vars missing");

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${SB}/rest/v1/${table}?select=*&order=created_at.asc.nullsfirst`, {
      headers: { ...headers, Range: `${from}-${from + 999}` },
    });
    if (res.status === 400 || res.status === 404) {
      // table has no created_at (or doesn't exist) — retry without ordering
      const retry = await fetch(`${SB}/rest/v1/${table}?select=*`, { headers: { ...headers, Range: `${from}-${from + 999}` } });
      if (!retry.ok) { console.log(`  ! ${table}: ${retry.status} (skipped)`); return rows; }
      const chunk = await retry.json();
      rows.push(...chunk);
      if (chunk.length < 1000) break;
      continue;
    }
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    const chunk = await res.json();
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}

const d = (v) => (v ? new Date(v) : new Date());
const strip = ({ id, ...rest }) => rest;

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.DB_NAME || "catalog");

async function upsertAll(name, docs) {
  if (docs.length === 0) return console.log(`${name}: 0`);
  await db.collection(name).bulkWrite(docs.map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } })));
  console.log(`${name}: ${docs.length}`);
}

// --- users (profiles + emails from the auth admin API; passwords can't be exported)
const profiles = await fetchAll("users");
const authRes = await fetch(`${SB}/auth/v1/admin/users?per_page=1000`, { headers });
const authUsers = authRes.ok ? (await authRes.json()).users ?? [] : [];
const emailById = new Map(authUsers.map((u) => [u.id, u.email]));
for (const u of authUsers) if (!profiles.find((p) => p.id === u.id)) profiles.push({ id: u.id, name: u.email?.split("@")[0] });
{
  const existing = new Map((await db.collection("users").find({}).toArray()).map((u) => [String(u._id), u]));
  const docs = profiles
    .filter((p) => emailById.get(p.id))
    .map((p) => ({
      ...(existing.get(p.id) ?? {}), // keep an already-set password_hash on re-run
      _id: p.id,
      email: emailById.get(p.id).toLowerCase(),
      name: p.name ?? emailById.get(p.id).split("@")[0],
      role: p.role ?? "admin",
      created_at: d(p.created_at),
    }));
  await upsertAll("users", docs);
}

// --- products (+ embedded product_media)
{
  const media = await fetchAll("product_media");
  const byProduct = new Map();
  for (const m of media) {
    if (!byProduct.has(m.product_id)) byProduct.set(m.product_id, []);
    byProduct.get(m.product_id).push({ id: m.id, media_type: m.media_type, file_url: m.file_url, r2_key: m.r2_key, sort_order: m.sort_order });
  }
  const products = await fetchAll("products");
  await upsertAll("products", products.map((p) => ({
    _id: p.id, ...strip(p), created_at: d(p.created_at),
    product_media: (byProduct.get(p.id) ?? []).sort((a, b) => a.sort_order - b.sort_order),
  })));
}

// --- catalogues (+ embedded catalogue_products)
{
  const links = await fetchAll("catalogue_products");
  const byCat = new Map();
  for (const l of links) {
    if (!byCat.has(l.catalogue_id)) byCat.set(l.catalogue_id, []);
    byCat.get(l.catalogue_id).push({ product_id: l.product_id, display_order: l.display_order, price_override: l.price_override ?? null });
  }
  const cats = await fetchAll("catalogues");
  await upsertAll("catalogues", cats.map((c) => ({
    _id: c.id, ...strip(c), created_at: d(c.created_at),
    catalogue_products: (byCat.get(c.id) ?? []).sort((a, b) => a.display_order - b.display_order),
  })));
}

// --- CAD catalogs (items stay in their own collection)
{
  const cats = await fetchAll("cad_catalogs");
  await upsertAll("cad_catalogs", cats.map((c) => ({ _id: c.id, ...strip(c), created_at: d(c.created_at) })));
  const items = await fetchAll("cad_catalog_items");
  const docs = items.map((i) => ({ _id: i.id, ...strip(i), created_at: d(i.created_at) }));
  for (let i = 0; i < docs.length; i += 500) await upsertAll("cad_catalog_items", docs.slice(i, i + 500));
}

// --- diamond catalogs
{
  const cats = await fetchAll("diamond_catalogs");
  await upsertAll("diamond_catalogs", cats.map((c) => ({ _id: c.id, ...strip(c), created_at: d(c.created_at) })));
}

// --- diamond stock (replaced wholesale; re-upload the Excel any time to refresh)
{
  const stock = await fetchAll("diamond_stock");
  if (stock.length) {
    const docs = stock.map((s) => ({ ...strip(s), imported_at: d(s.imported_at) }));
    await db.collection("diamond_stock").deleteMany({});
    for (let i = 0; i < docs.length; i += 1000) await db.collection("diamond_stock").insertMany(docs.slice(i, i + 1000));
  }
  console.log(`diamond_stock: ${stock.length}`);
}

await client.close();
console.log("Done. Users have no passwords yet — run scripts/set-password.mjs for each.");
