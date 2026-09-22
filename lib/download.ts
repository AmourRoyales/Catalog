import JSZip from "jszip";

// One media item on a product.
type DownloadMedia = {
  file_url: string;
  media_type: string;
};

// The minimum a product needs to be downloadable.
type DownloadProduct = {
  product_code: string;
  product_media: DownloadMedia[];
};

// Pull the file extension off an R2 url (…/1736-video.mp4 -> "mp4").
function extFromUrl(url: string, mediaType: string): string {
  const clean = url.split("?")[0];
  const last = clean.substring(clean.lastIndexOf("/") + 1);
  const dot = last.lastIndexOf(".");
  if (dot !== -1 && dot < last.length - 1) {
    return last.substring(dot + 1).toLowerCase();
  }
  return mediaType === "video" ? "mp4" : "jpg";
}

// Fetch one file's raw data through our own server proxy (bypasses
// the r2.dev CORS block).
async function fetchThroughProxy(url: string): Promise<Response> {
  const proxied = `/api/download?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxied);
  if (!res.ok) {
    throw new Error(`Failed to fetch (${res.status})`);
  }
  return res;
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetchThroughProxy(url);
  return res.blob();
}

// Trigger the browser "Save as" for a finished in-memory blob.
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Detect whether this browser can stream to disk.
function canStream(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof (window as any).WritableStream !== "undefined" &&
    typeof (window as any).ReadableStream !== "undefined"
  );
}

// ---------------------------------------------------------------
// Download ONE product's media as a single ZIP, foldered by code.
// ---------------------------------------------------------------
export async function downloadProduct(product: DownloadProduct): Promise<void> {
  const media = product.product_media ?? [];
  if (media.length === 0) {
    throw new Error("This product has no media to download.");
  }

  const zip = new JSZip();
  let i = 1;
  for (const m of media) {
    const blob = await fetchBlob(m.file_url);
    const ext = extFromUrl(m.file_url, m.media_type);
    zip.file(`${product.product_code}-${i}.${ext}`, blob);
    i++;
  }

  const out = await zip.generateAsync({ type: "blob" });
  saveBlob(out, `${product.product_code}.zip`);
}

// ---------------------------------------------------------------
// Download MANY products as ONE ZIP, streamed to disk. Falls back to
// chunked in-memory ZIPs if the browser can't stream.
// ---------------------------------------------------------------
export async function downloadMany(
  products: DownloadProduct[],
  zipName: string,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const withMedia = products.filter(
    (p) => (p.product_media?.length ?? 0) > 0
  );
  if (withMedia.length === 0) {
    throw new Error("None of these products have media to download.");
  }

  const total = withMedia.reduce((sum, p) => sum + p.product_media.length, 0);

  if (canStream()) {
    try {
      await streamManyToDisk(withMedia, zipName, total, onProgress);
      return;
    } catch (err) {
      console.warn("Streaming download failed, falling back to chunks:", err);
    }
  }

  await chunkedMany(withMedia, zipName, total, onProgress);
}

// --- Streaming path: ZIP written to disk as files arrive ---
async function streamManyToDisk(
  products: DownloadProduct[],
  zipName: string,
  total: number,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  // Load streamsaver only now, in the browser, at click-time — never
  // at import (which would break server-side rendering on Netlify).
  const { default: streamSaver } = await import("streamsaver");
  streamSaver.mitm = "/mitm.html";

  const { default: ZipStream } = await import("./zip-stream");

  const fileStream = streamSaver.createWriteStream(`${zipName}.zip`);
  const writer = fileStream.getWriter();

  const zip = new ZipStream({
    onData: (chunk: Uint8Array) => writer.write(chunk),
  });

  let done = 0;
  for (const p of products) {
    let i = 1;
    for (const m of p.product_media) {
      const res = await fetchThroughProxy(m.file_url);
      const buf = new Uint8Array(await res.arrayBuffer());
      const ext = extFromUrl(m.file_url, m.media_type);
      zip.addFile(`${p.product_code}/${p.product_code}-${i}.${ext}`, buf);
      i++;
      done++;
      onProgress?.(done, total);
    }
  }

  zip.finish();
  await writer.close();
}

// --- Fallback path: many small in-memory ZIPs (25 products each) ---
async function chunkedMany(
  products: DownloadProduct[],
  zipName: string,
  total: number,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const CHUNK = 25;
  const parts = Math.ceil(products.length / CHUNK);
  let done = 0;

  for (let part = 0; part < parts; part++) {
    const slice = products.slice(part * CHUNK, part * CHUNK + CHUNK);
    const zip = new JSZip();

    for (const p of slice) {
      const folder = zip.folder(p.product_code);
      let i = 1;
      for (const m of p.product_media) {
        const blob = await fetchBlob(m.file_url);
        const ext = extFromUrl(m.file_url, m.media_type);
        folder?.file(`${p.product_code}-${i}.${ext}`, blob);
        i++;
        done++;
        onProgress?.(done, total);
      }
    }

    const out = await zip.generateAsync({ type: "blob" });
    const suffix = parts > 1 ? `-part${part + 1}of${parts}` : "";
    saveBlob(out, `${zipName}${suffix}.zip`);
  }
}