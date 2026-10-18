"use client";

// Product thumbnail for the catalogue builder lists. Small enough for a
// list row; hovering shows a large floating preview (pointer devices), and
// clicking opens every photo/video of the product in a lightbox (works on
// touch screens too, where there is no hover).
import { useEffect, useRef, useState } from "react";

export type ThumbMedia = { file_url: string; media_type: string };

const PREVIEW = 288; // floating preview size, px

function Media({ m, className, play }: { m: ThumbMedia; className: string; play?: boolean }) {
  if (m.media_type === "video") {
    // "#t=0.1" makes browsers paint the first frame as a still.
    return play ? (
      <video src={m.file_url} className={className} autoPlay muted loop playsInline />
    ) : (
      <video src={`${m.file_url}#t=0.1`} className={className} muted playsInline preload="metadata" />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={m.file_url} className={className} alt="" loading="lazy" />;
}

export default function ProductThumb({
  media, name, code, card = false,
}: {
  /** The product's media in display order; the first is the cover. */
  media: ThumbMedia[];
  name: string;
  code: string;
  /** Fill a card's whole image area (no hover pop-out — the image is already large). */
  card?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState<{ top: number; left: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const cover = media[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % media.length);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + media.length) % media.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, media.length]);

  function showHover() {
    if (card || !cover || !window.matchMedia("(hover: hover)").matches) return;
    const r = ref.current!.getBoundingClientRect();
    // Beside the thumbnail, flipped to the left near the right edge, and
    // kept inside the viewport vertically.
    const left = r.right + 12 + PREVIEW < window.innerWidth ? r.right + 12 : Math.max(8, r.left - 12 - PREVIEW);
    const top = Math.min(Math.max(8, r.top + r.height / 2 - PREVIEW / 2 - 28), window.innerHeight - PREVIEW - 72);
    setHover({ top, left });
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => cover && (setIndex(0), setOpen(true), setHover(null))}
        onMouseEnter={showHover}
        onMouseLeave={() => setHover(null)}
        disabled={!cover}
        aria-label={cover ? `Preview ${name}` : undefined}
        className={
          card
            ? "relative block w-full aspect-square bg-placeholder overflow-hidden cursor-zoom-in disabled:cursor-default"
            : "relative w-12 h-12 rounded-lg bg-page overflow-hidden shrink-0 cursor-zoom-in disabled:cursor-default ring-[#3E86C6]/60 hover:ring-2 transition"
        }
      >
        {cover && <Media m={cover} className="w-full h-full object-cover" />}
        {cover?.media_type === "video" && (
          <span className="absolute bottom-0.5 right-0.5 text-[8px] leading-none px-1 py-0.5 rounded bg-black/60 text-white">▶</span>
        )}
      </button>

      {hover && cover && (
        <div
          className="fixed z-50 pointer-events-none rounded-xl overflow-hidden bg-surface border border-gray-200 shadow-2xl"
          style={{ top: hover.top, left: hover.left, width: PREVIEW }}
        >
          <Media m={cover} play className="block w-full aspect-square bg-black object-contain" />
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-ink line-clamp-2">{name}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {code}
              {media.length > 1 ? ` · ${media.length} photos & videos — click to see all` : ""}
            </p>
          </div>
        </div>
      )}

      {open && cover && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="relative bg-surface rounded-2xl max-w-3xl w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close preview"
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 text-white text-lg leading-none hover:bg-black/70"
            >
              ×
            </button>
            <div className="bg-black aspect-square max-h-[70vh] w-full flex items-center justify-center">
              <Media key={media[index].file_url} m={media[index]} play className="w-full h-full object-contain" />
            </div>
            <div className="px-4 py-3">
              <p className="text-sm font-semibold text-ink">{name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{code}</p>
              {media.length > 1 && (
                <div className="flex gap-2 mt-3 overflow-x-auto">
                  {media.map((m, i) => (
                    <button
                      key={m.file_url}
                      onClick={() => setIndex(i)}
                      aria-label={`Show ${m.media_type} ${i + 1}`}
                      className={`relative w-14 h-14 rounded-md overflow-hidden shrink-0 border-2 ${i === index ? "border-[#3E86C6]" : "border-transparent"}`}
                    >
                      <Media m={m} className="w-full h-full object-cover" />
                      {m.media_type === "video" && (
                        <span className="absolute inset-0 flex items-center justify-center text-white text-xs bg-black/20">▶</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
