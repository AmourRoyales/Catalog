import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getMatchingSets } from "@/lib/cad-designs";

// Auth-gated, like the rest of the CAD catalog builder. Small, fixed list
// (a few dozen pairs) — no pagination needed.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  return NextResponse.json({ sets: getMatchingSets() });
}
