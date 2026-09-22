import { NextRequest, NextResponse } from "next/server";

// Server-side proxy for R2 media downloads.
// The browser can't fetch r2.dev files directly (the dev URL ignores
// CORS), so it asks THIS route instead. The server fetches from R2
// (no CORS rules apply server-side) and streams the file back.
//
// Security: we only allow fetching from your own R2 public host, so
// this can't be abused to fetch arbitrary URLs off the internet.

export async function GET(request: NextRequest) {
  const fileUrl = request.nextUrl.searchParams.get("url");

  if (!fileUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  // Only permit URLs from your configured R2 public host.
  const allowedBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (!allowedBase || !fileUrl.startsWith(allowedBase)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(fileUrl);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream fetch failed (${upstream.status})` },
        { status: 502 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Proxy fetch error" },
      { status: 500 }
    );
  }
}