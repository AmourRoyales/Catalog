import type { Metadata } from "next";
import { getDb } from "@/lib/mongo";

// Public, unauthenticated, video-only share link for a single stone — what
// the "Open video in new tab" / "Copy video link" buttons in StoneDetail
// point at. Keyed by stone_id rather than the Mongo id because each stock
// import replaces every diamond_stock doc (new ids), while stone_id stays
// the same, so a link sent to a customer keeps working across imports.
// Deliberately projects only what this page renders: no price, cost,
// location or certificate data ever reaches it.

type VideoStone = {
  stone_id: string; shape: string; carat: number; color: string; clarity: string;
  video_link: string | null;
};

const titleCase = (t: string) => t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const describe = (s: VideoStone) => `${titleCase(s.shape)} ${Number(s.carat).toFixed(2)}ct ${s.color} ${s.clarity}`;

async function getStone(rawId: string) {
  let stoneId = rawId;
  try {
    stoneId = decodeURIComponent(rawId);
  } catch {}
  const db = await getDb();
  // Same always-on rule as the catalogs: only stones actually on hand.
  return db.collection("diamond_stock").findOne<VideoStone>(
    { stone_id: stoneId, stone_stage: "OH", video_link: { $nin: [null, ""] } },
    { projection: { _id: 0, stone_id: 1, shape: 1, carat: 1, color: 1, clarity: 1, video_link: 1 } }
  );
}

export async function generateMetadata({ params }: { params: { stoneId: string } }): Promise<Metadata> {
  const stone = await getStone(params.stoneId);
  return { title: stone ? `${describe(stone)} — JeniDiam` : "Video not available — JeniDiam" };
}

export default async function StoneVideoPage({ params }: { params: { stoneId: string } }) {
  const stone = await getStone(params.stoneId);

  if (!stone?.video_link) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F8FB]">
        <div className="text-center px-6">
          <p className="text-gray-500 mt-4">This video is not available.</p>
          <p className="text-sm text-gray-400 mt-1">The link may be incorrect, or the stone is no longer available.</p>
        </div>
      </div>
    );
  }

  const isMp4 = /\.(mp4|webm|mov)(\?|$)/i.test(stone.video_link);

  return (
    <div className="min-h-screen bg-[#F5F8FB] flex flex-col">
      <header className="px-4 sm:px-6 py-3 border-b border-gray-200 bg-white">
        <p className="font-serif text-lg text-[#3E86C6]">JeniDiam</p>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6">
        <div className="w-full max-w-3xl aspect-square bg-[#D9DBE6] rounded-xl overflow-hidden flex items-center justify-center">
          {isMp4 ? (
            <video
              src={stone.video_link}
              controls
              autoPlay
              loop
              muted
              playsInline
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              className="w-full h-full object-contain"
            />
          ) : (
            <iframe src={stone.video_link} title="360° video" className="w-full h-full bg-white" allow="fullscreen" />
          )}
        </div>
        <p className="text-sm text-gray-600 mt-3">{describe(stone)}</p>
      </main>
    </div>
  );
}
