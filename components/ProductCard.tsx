"use client";

// Image card for the catalogue builder's two panels ("All products" and
// "In this catalogue"): the product's cover fills the top (click it for
// every photo/video), name and code below, and the panel's own actions in
// the footer.
import ProductThumb, { type ThumbMedia } from "@/components/ProductThumb";

export default function ProductCard({
  media, name, code, meta, badge, corner, children,
}: {
  media: ThumbMedia[];
  name: string;
  code: string;
  /** Extra detail line, e.g. "Ring · Eternity Band · Baguette". */
  meta?: string;
  /** Top-left over the image, e.g. the position in the catalogue. */
  corner?: React.ReactNode;
  /** Small tag after the code, e.g. a catalogue-specific price. */
  badge?: React.ReactNode;
  /** Action buttons. */
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col rounded-lg border border-gray-200 bg-surface overflow-hidden hover:shadow-md transition">
      <ProductThumb media={media} name={name} code={code} card />
      {corner && (
        <span className="absolute top-1.5 left-1.5 min-w-[22px] h-[22px] px-1.5 rounded-full bg-black/60 text-white text-[11px] font-semibold flex items-center justify-center pointer-events-none">
          {corner}
        </span>
      )}
      <div className="flex-1 flex flex-col px-2.5 pt-2 pb-2.5">
        <p className="text-[12px] font-medium text-ink leading-snug line-clamp-2" title={name}>
          {name}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5 truncate">
          {code}
          {meta ? ` · ${meta}` : ""}
        </p>
        {badge && <div className="mt-1">{badge}</div>}
        <div className="mt-auto pt-2 flex items-center gap-1">{children}</div>
      </div>
    </div>
  );
}
