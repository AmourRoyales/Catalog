import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { verifyMediaBatch } from "@/lib/media-check";

// One batch of photo/video checks (lib/media-check.ts). The Diamond Stock
// page calls this repeatedly while stones are waiting to be checked; each
// call stays under a minute so it fits a serverless function.
export const maxDuration = 60;

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const result = await verifyMediaBatch(await getDb(), { deadlineMs: Date.now() + 45_000 });
  return NextResponse.json(result);
}

// How many stones still need checking.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const remaining = await (await getDb()).collection("diamond_stock").countDocuments({ media_checked_at: { $exists: false } });
  return NextResponse.json({ remaining });
}
