// Edge-safe (jose only) — shared by middleware and server code.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "jd_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export type SessionUser = { id: string; email: string };

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
};

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return { id: payload.sub, email: String(payload.email ?? "") };
  } catch {
    return null;
  }
}
