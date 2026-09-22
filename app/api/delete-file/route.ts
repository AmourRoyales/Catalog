import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { deleteFile } from "@/lib/r2";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { keys } = await request.json();
  if (!Array.isArray(keys) || keys.length === 0) {
    return NextResponse.json({ error: "No keys provided" }, { status: 400 });
  }

  for (const key of keys) {
    try {
      await deleteFile(key);
    } catch {
      // File may already be gone — not fatal, continue
    }
  }

  return NextResponse.json({ ok: true });
}