import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getUploadUrl } from "@/lib/r2";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { fileName, contentType, productCode } = await request.json();

  if (!fileName || !contentType || !productCode) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Clean file name + unique key: products/RNG-0042/1736412345-photo1.jpg
  const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const key = `products/${productCode}/${Date.now()}-${safeName}`;

  const uploadUrl = await getUploadUrl(key, contentType);
  const publicUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`;

  return NextResponse.json({ uploadUrl, key, publicUrl });
}