import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/mongo";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { status } = await request.json();
  if (status !== "active" && status !== "archived") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const db = await getDb();
  await db.collection("diamond_catalogs").updateOne({ _id: params.id as any }, { $set: { status } });
  return NextResponse.json({ ok: true });
}
