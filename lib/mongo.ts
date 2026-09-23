// Server-only MongoDB access.
import { MongoClient, type Db } from "mongodb";
import { randomBytes, randomUUID } from "crypto";

const globalForMongo = globalThis as unknown as {
  _mongoClient?: Promise<MongoClient>;
  _mongoIndexes?: Promise<void>;
};

function getClient(): Promise<MongoClient> {
  if (!globalForMongo._mongoClient) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    globalForMongo._mongoClient = new MongoClient(uri).connect();
  }
  return globalForMongo._mongoClient;
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("products").createIndex({ product_code: 1 }, { unique: true }),
    db.collection("products").createIndex({ created_at: -1 }),
    db.collection("catalogues").createIndex({ share_token: 1 }, { unique: true }),
    db.collection("cad_catalogs").createIndex({ code: 1 }, { unique: true }),
    db.collection("cad_catalog_items").createIndex({ catalog_id: 1, display_order: 1 }),
    db.collection("diamond_catalogs").createIndex({ code: 1 }, { unique: true }),
    db.collection("diamond_stock").createIndex({ shape: 1, carat: 1 }),
    db.collection("diamond_stock").createIndex({ batch_id: 1 }),
    // Every diamond_stock query filters on stone_stage, and now sorts by
    // either amount or carat (see lib/diamond-stock-query.ts DiamondSort) —
    // one index per sortable field lets the filter and the sort share an
    // index instead of an in-memory sort, so catalog pages stay fast as
    // stock grows.
    db.collection("diamond_stock").createIndex({ stone_stage: 1, amount: 1 }),
    db.collection("diamond_stock").createIndex({ stone_stage: 1, carat: 1 }),
  ]);
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  const db = client.db(process.env.DB_NAME || "catalog");
  if (!globalForMongo._mongoIndexes) globalForMongo._mongoIndexes = ensureIndexes(db);
  await globalForMongo._mongoIndexes;
  return db;
}

export const newId = () => randomUUID();
export const newShareCode = () => randomBytes(5).toString("hex");

/** Maps a Mongo document to the API shape: `_id` becomes a string `id`. */
export function serialize<T extends { _id?: unknown }>(doc: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest } as Omit<T, "_id"> & { id: string };
}

export const isDuplicateKeyError = (e: unknown) => (e as { code?: number })?.code === 11000;
