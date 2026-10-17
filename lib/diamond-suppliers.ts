// Server-only. diamond_stock holds stones from several suppliers at once —
// each row carries the `supplier_id` it was uploaded under (a
// diamond_suppliers doc), so one supplier's list can be replaced or purged
// without touching the others. Rows from before suppliers existed have no
// supplier_id ("unassigned").
//
// Every stone is stored once: when two suppliers list the same stone (same
// certificate number), only the better copy is kept — see dedupeAgainstStock.
import type { Db, ObjectId } from "mongodb";
import { certKey } from "@/lib/diamond-stock-import";

export type SupplierDoc = { _id: string; name: string; created_at: Date };

type Comparable = { stone_stage?: unknown; amount?: unknown };

/** Better copy of the same stone: on hand (stone_stage "OH") first, then lower landed cost. Ties keep `b`. */
export function isBetterCopy(a: Comparable, b: Comparable): boolean {
  const rank = (r: Comparable) => (r.stone_stage === "OH" ? 0 : 1);
  if (rank(a) !== rank(b)) return rank(a) < rank(b);
  return Number(a.amount) < Number(b.amount);
}

/** Collapses rows sharing a cert_key within one upload to the best copy. Rows without a cert_key are all kept. */
export function uniqueByCert<T extends Comparable & { cert_key?: unknown }>(rows: T[]): { rows: T[]; dropped: number } {
  const best = new Map<string, T>();
  const out: T[] = [];
  for (const r of rows) {
    const key = typeof r.cert_key === "string" ? r.cert_key : null;
    if (!key) {
      out.push(r);
      continue;
    }
    const prev = best.get(key);
    if (!prev || isBetterCopy(r, prev)) best.set(key, r);
  }
  out.push(...Array.from(best.values()));
  return { rows: out, dropped: rows.length - out.length };
}

/**
 * Checks an incoming supplier upload against what other suppliers already
 * have in diamond_stock. For each certificate already on file elsewhere,
 * the better copy wins: either the incoming row is dropped (`skipped`), or
 * the existing row is returned in `displaceIds` for the caller to delete
 * once the new rows are in.
 */
export async function dedupeAgainstStock<T extends Comparable & { cert_key?: unknown }>(
  db: Db,
  supplierId: string,
  incoming: T[]
): Promise<{ rows: T[]; skipped: number; displaceIds: ObjectId[] }> {
  const col = db.collection("diamond_stock");

  // Stones imported before cert_key existed: derive it once from report_no.
  const legacy = await col.find({ cert_key: { $exists: false } }, { projection: { report_no: 1 } }).toArray();
  if (legacy.length) {
    await col.bulkWrite(
      legacy.map((d) => ({ updateOne: { filter: { _id: d._id }, update: { $set: { cert_key: certKey(d.report_no) } } } })),
      { ordered: false }
    );
  }

  const keys = incoming.map((r) => r.cert_key).filter((k): k is string => typeof k === "string");
  // $ne also matches unassigned rows (no supplier_id). This supplier's own
  // old rows are excluded: they're about to be replaced wholesale.
  const existing = await col
    .find<{ _id: ObjectId; cert_key: string; stone_stage?: string; amount?: number }>(
      { supplier_id: { $ne: supplierId }, cert_key: { $in: keys } },
      { projection: { cert_key: 1, stone_stage: 1, amount: 1 } }
    )
    .toArray();
  const byKey = new Map<string, (typeof existing)[number][]>();
  for (const e of existing) byKey.set(e.cert_key, [...(byKey.get(e.cert_key) ?? []), e]);

  const rows: T[] = [];
  const displaceIds: ObjectId[] = [];
  let skipped = 0;
  for (const r of incoming) {
    const others = typeof r.cert_key === "string" ? byKey.get(r.cert_key) : undefined;
    if (!others) {
      rows.push(r);
    } else if (others.every((o) => isBetterCopy(r, o))) {
      rows.push(r);
      displaceIds.push(...others.map((o) => o._id));
    } else {
      skipped++;
    }
  }
  return { rows, skipped, displaceIds };
}

export type SupplierStats = {
  id: string | null; // null = unassigned (pre-supplier) stock
  name: string;
  count: number;
  /** On hand — what catalogs can show. */
  shown: number;
  lastImportedAt: Date | null;
};

/** Per-supplier stone counts for the Diamond Stock admin page, including an "unassigned" bucket when legacy rows exist. */
export async function getSupplierStats(db: Db): Promise<SupplierStats[]> {
  const [suppliers, agg] = await Promise.all([
    db.collection<SupplierDoc>("diamond_suppliers").find({}).sort({ name: 1 }).toArray(),
    db
      .collection("diamond_stock")
      .aggregate<{ _id: string | null; count: number; shown: number; lastImportedAt: Date | null }>([
        {
          $group: {
            _id: { $ifNull: ["$supplier_id", null] },
            count: { $sum: 1 },
            shown: { $sum: { $cond: [{ $eq: ["$stone_stage", "OH"] }, 1, 0] } },
            lastImportedAt: { $max: "$imported_at" },
          },
        },
      ])
      .toArray(),
  ]);
  const bySupplier = new Map(agg.map((a) => [a._id, a]));
  const stats: SupplierStats[] = suppliers.map((s) => {
    const a = bySupplier.get(s._id);
    return { id: s._id, name: s.name, count: a?.count ?? 0, shown: a?.shown ?? 0, lastImportedAt: a?.lastImportedAt ?? null };
  });
  const legacy = bySupplier.get(null);
  if (legacy?.count) {
    stats.push({ id: null, name: "Unassigned", count: legacy.count, shown: legacy.shown, lastImportedAt: legacy.lastImportedAt });
  }
  return stats;
}
