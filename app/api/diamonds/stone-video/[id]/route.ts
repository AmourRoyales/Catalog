import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongo";
import { stoneVideoAvailable } from "@/lib/media-check";

// Public (under /api/diamonds, which middleware leaves open), unauthenticated: whether one stone's video really exists (see
// lib/media-check.ts), so the stone detail modal — on public catalog links
// and in the app — can hide a video tab that would only show a blank
// viewer. Takes a stone id, never a URL, so it only ever checks links that
// are already in our own stock.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ video: false });
  const db = await getDb();
  const stone = await db
    .collection("diamond_stock")
    .findOne({ _id: new ObjectId(params.id) }, { projection: { video_link: 1, video_ok: 1, image_link: 1, image_ok: 1, cert_link: 1 } });
  return NextResponse.json({ video: stone ? await stoneVideoAvailable(db, stone) : false });
}
