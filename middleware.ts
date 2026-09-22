import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Public share links: always allowed, no checks.
  // "/catalog" also matches the existing "/catalogue" (manual-product)
  // links as a prefix, covering both that and the CAD-catalog share links
  // at /catalog/[code]. "/diamonds" is the live-filtered diamond catalog
  // share link, and its pagination API (/api/diamonds/[code]) must stay
  // public too, or a shared link couldn't load page 2+ once logged out.
  if (
    path.startsWith("/catalog") ||
    path.startsWith("/diamonds") ||
    path.startsWith("/api/diamonds") ||
    path.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  const user = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  // On the login page: logged-in users go to products, everyone else stays
  if (path.startsWith("/login")) {
    if (user) {
      return NextResponse.redirect(new URL("/products", request.url));
    }
    return NextResponse.next();
  }

  // Everywhere else: must be logged in
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp)$).*)",
  ],
};