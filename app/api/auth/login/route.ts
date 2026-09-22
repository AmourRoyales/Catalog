import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/mongo";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/session";

export async function POST(request: Request) {
  const { email, password } = await request.json().catch(() => ({}));
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
  }

  const db = await getDb();
  const user = await db.collection("users").findOne({ email: email.trim().toLowerCase() });
  const ok = user?.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !ok) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const token = await signSession({ id: String(user._id), email: user.email });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
