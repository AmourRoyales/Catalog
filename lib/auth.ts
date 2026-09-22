// Server-only: read the signed-in user inside route handlers / server components.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession, type SessionUser } from "@/lib/session";

export async function getCurrentUser(): Promise<SessionUser | null> {
  return verifySession(cookies().get(SESSION_COOKIE)?.value);
}

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
