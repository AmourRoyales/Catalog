import type { Metadata } from "next";
import { getDb } from "@/lib/mongo";
import VideoPlayer from "./player";

// Public, video-only share link for one product video inside a catalogue —
// what the "Open video in new tab" / "Copy video link" buttons in the
// catalogue viewer point at. Scoped to the catalogue (rather than a bare
// product link) so it follows that catalogue's rules: it stops working if
// the catalogue is deactivated or the product is removed from it, and it
// inherits show_branding — watermark + locked downloads when on,
// white-label with downloads allowed when off, same as the viewer.
// Only the product name and the video are rendered: no price, code or
// description.

// Generic diamond favicon — same as the catalogue viewer, never the site icon.
const GENERIC_DIAMOND_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M8 4h16l6 8-14 16L2 12z" fill="none" stroke="#3E86C6" stroke-width="2" stroke-linejoin="round"/><path d="M2 12h28M11 4l-3 8 8 16M21 4l3 8-8 16" fill="none" stroke="#3E86C6" stroke-width="1.5" stroke-linejoin="round"/></svg>`
  );

type Params = { token: string; mediaId: string };
type ProductDoc = {
  _id: string; name: string; status: string;
  product_media?: { id: string; media_type: string; file_url: string }[];
};

async function getVideo({ token, mediaId }: Params) {
  const db = await getDb();
  const catalogue = await db.collection("catalogues").findOne({ share_token: token });
  if (!catalogue || catalogue.status !== "active") return null;

  const productIds = ((catalogue.catalogue_products ?? []) as { product_id: string }[]).map((l) => l.product_id);
  const product = await db.collection<ProductDoc>("products").findOne(
    { _id: { $in: productIds }, status: "active", "product_media.id": mediaId },
    { projection: { name: 1, product_media: 1 } }
  );
  const media = (product?.product_media ?? []).find(
    (m) => m.id === mediaId && m.media_type === "video"
  );
  if (!product || !media) return null;

  return { name: product.name, url: media.file_url, showBranding: !!catalogue.show_branding };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const video = await getVideo(params);
  const title = !video ? "Video not available" : video.showBranding ? `${video.name} — JeniDiam` : video.name;
  return { title, icons: { icon: GENERIC_DIAMOND_FAVICON } };
}

export default async function CatalogueVideoPage({ params }: { params: Params }) {
  const video = await getVideo(params);

  if (!video) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="text-center px-6">
          <p className="text-gray-500 mt-4">This video is not available.</p>
          <p className="text-sm text-gray-400 mt-1">The link may be incorrect, or the video has been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page flex flex-col">
      {video.showBranding && (
        <header className="px-4 sm:px-6 py-3 border-b border-gray-200 bg-surface">
          <p className="font-serif text-lg text-[#3E86C6]">JeniDiam</p>
        </header>
      )}
      <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6">
        <div className="w-full max-w-3xl aspect-square bg-[#0d1520] rounded-xl overflow-hidden relative">
          <VideoPlayer src={video.url} downloadsAllowed={!video.showBranding} />
          {/* Watermark — bottom middle, only when branding is on (as in the viewer) */}
          {video.showBranding && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/watermark.png"
              alt=""
              aria-hidden
              className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 w-2/5 max-w-[220px] select-none"
            />
          )}
        </div>
        <p className="font-serif text-lg text-ink mt-3">{video.name}</p>
      </main>
    </div>
  );
}
