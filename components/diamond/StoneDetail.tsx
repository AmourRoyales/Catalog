"use client";

// Single-stone detail modal — shared by the public catalog viewer
// (app/diamonds/[code]) and the in-app View Diamonds page, so both show the
// exact same thing.
import { useState } from "react";
import { formatPrice } from "@/lib/format";
import { PRICING_PROFILE } from "@/lib/diamond-pricing";

export type StockRow = {
  id: string; stone_id: string; shape: string; carat: number; color: string; clarity: string;
  cut: string | null; polish: string | null; symm: string | null; fls: string | null; cert: string;
  rate: number; amount: number; measurement: string | null; location: string | null;
  length_mm: number | null; width_mm: number | null; depth_mm: number | null;
  table_pct: number | null; depth_pct: number | null; ratio: number | null;
  ca: number | null; ch: number | null; pa: number | null; ph: number | null;
  girdle: string | null; culet: string | null; shade: string | null; eye_clean: string | null;
  growth_type: string | null; report_no: string | null;
  image_link: string | null; video_link: string | null; cert_link: string | null;
  // Present only on admin-facing rows (the builder / View Diamonds), never
  // on public ones — see lib/diamond-pricing.ts withAdminPricing/withPublicPricing.
  // rate/amount are always the catalog (sell) price; these are the landed
  // cost and the full markup breakdown that produced it.
  costRate?: number; costAmount?: number;
  baseMarkupPercent?: number; colorAdjustmentPercent?: number; clarityAdjustmentPercent?: number;
  largeStoneAdjustmentPercent?: number; finalMarkupPercent?: number; marginAmount?: number;
  pricingReviewRequired?: boolean; marketCeiling?: number | null;
};

const BLUE = "#3E86C6";

const GRADE: Record<string, string> = { ID: "Ideal", EX: "Excellent", VG: "Very Good", GD: "Good", FR: "Fair", PR: "Poor", "-": "—" };
const FLS: Record<string, string> = { NON: "None", SL: "Slight", VSL: "Very Slight", STG: "Strong" };
const g = (v: string | null) => (v ? GRADE[v] ?? v : "—");
const titleCase = (t: string) => t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const num = (v: number | null, suffix = "") => (v == null ? "—" : `${v}${suffix}`);

type Tab = "image" | "video" | "cert";

export default function StoneDetail({ r, showPrice, onClose }: { r: StockRow; showPrice: boolean; onClose: () => void }) {
  const tabs: { key: Tab; label: string; available: boolean }[] = [
    { key: "image", label: "Image", available: !!r.image_link },
    { key: "video", label: "Video", available: !!r.video_link },
    { key: "cert", label: "Certificate", available: !!r.cert_link },
  ];
  const [tab, setTab] = useState<Tab>(tabs.find((t) => t.available)?.key ?? "image");
  const isMp4 = !!r.video_link && /\.(mp4|webm|mov)(\?|$)/i.test(r.video_link);
  const hasCost = r.costRate != null && r.costAmount != null && r.finalMarkupPercent != null;
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  const both = (a: number | null, b: number | null) =>
    a == null && b == null ? "—" : `${a == null ? "—" : `${a}%`}, ${b == null ? "—" : `${b}°`}`;

  const left: [string, string][] = [
    ["Lab", r.cert],
    ["Report#", r.report_no ?? "—"],
    ["Shape", titleCase(r.shape)],
    ["Carat", Number(r.carat).toFixed(2)],
    ["Color", r.color],
    ["Clarity", r.clarity],
    ["Cut", g(r.cut)],
    ["Polish", g(r.polish)],
    ["Symmetry", g(r.symm)],
    ["Fluor", r.fls ? FLS[r.fls] ?? r.fls : "—"],
  ];
  const right: [string, string][] = [
    ["Depth", num(r.depth_pct, "%")],
    ["Table", num(r.table_pct, "%")],
    ["Girdle", r.girdle ?? "—"],
    ["Crown", both(r.ch, r.ca)],
    ["Pavilion", both(r.ph, r.pa)],
    ["Culet", r.culet ?? "—"],
    ["Meas", r.length_mm != null && r.width_mm != null && r.depth_mm != null ? `${r.length_mm} x ${r.width_mm} x ${r.depth_mm}` : r.measurement ?? "—"],
    ["Ratio", num(r.ratio)],
    ["BGM", r.shade ?? "—"],
    ["Growth Type", r.growth_type ?? "—"],
  ];
  const [detailsOpen, setDetailsOpen] = useState(true);

  const thumbIcon: Record<Tab, React.ReactNode> = {
    image: r.image_link ? <img src={r.image_link} alt="" className="w-full h-full object-cover" /> : <span className="text-gray-400 text-xs">Image</span>,
    video: (
      <div className="relative w-full h-full bg-gray-500 flex items-center justify-center">
        {r.image_link && <img src={r.image_link} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />}
        <span className="relative w-7 h-7 rounded-full bg-white flex items-center justify-center text-gray-600 text-xs">▶</span>
      </div>
    ),
    cert: (
      <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#16283A]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="14" height="14" rx="1.5" /><path d="M8 7h6M8 10h6" /><circle cx="16" cy="17" r="3" /><path d="M14.5 19.5 14 23l2-1 2 1-.5-3.5" />
      </svg>
    ),
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="relative bg-[#EDEEF3] rounded-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white text-gray-500 hover:bg-gray-100 text-lg leading-none">×</button>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6">
          {/* Media: thumbnails + viewer */}
          <div className="flex gap-3">
            <div className="flex flex-col gap-2 shrink-0">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  disabled={!t.available}
                  onClick={() => setTab(t.key)}
                  className={`w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-lg overflow-hidden border-2 bg-white flex items-center justify-center ${
                    t.available ? "" : "opacity-30 cursor-not-allowed"
                  }`}
                  style={{ borderColor: tab === t.key ? BLUE : "transparent" }}
                  title={t.label}
                >
                  {thumbIcon[t.key]}
                </button>
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="aspect-square bg-[#D9DBE6] rounded-lg overflow-hidden flex items-center justify-center">
                {tab === "image" &&
                  (r.image_link ? <img src={r.image_link} alt={r.stone_id} className="w-full h-full object-contain" /> : <span className="text-gray-400 text-sm">No image</span>)}
                {tab === "video" &&
                  (r.video_link ? (
                    isMp4 ? (
                      <video key={r.video_link} src={r.video_link} controls autoPlay loop playsInline className="w-full h-full object-contain" />
                    ) : (
                      <iframe src={r.video_link} title="360° video" className="w-full h-full bg-white" allow="fullscreen" />
                    )
                  ) : (
                    <span className="text-gray-400 text-sm">No video</span>
                  ))}
                {tab === "cert" &&
                  (r.cert_link ? (
                    <iframe src={r.cert_link} title={`${r.cert} certificate`} className="w-full h-full bg-white" />
                  ) : (
                    <span className="text-gray-400 text-sm">No certificate</span>
                  ))}
              </div>
              {tab === "video" && r.video_link && !isMp4 && (
                <a href={r.video_link} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline mt-2 inline-block" style={{ color: BLUE }}>
                  Open video in new tab ↗
                </a>
              )}
              {tab === "cert" && r.cert_link && (
                <a href={r.cert_link} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline mt-2 inline-block" style={{ color: BLUE }}>
                  Open certificate in new tab ↗
                </a>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="min-w-0">
            <h2 className="text-3xl font-bold text-black mt-8 pr-8">
              {titleCase(r.shape)} {Number(r.carat).toFixed(2)}ct {r.color} {r.clarity}
            </h2>
            <p className="text-sm text-gray-600 mt-3">Stock# <span className="font-semibold text-black">{r.stone_id}</span></p>

            {showPrice && (
              <div className="bg-white rounded-xl border border-gray-200 mt-5 px-4 py-3 text-sm">
                <div className="grid grid-cols-[1fr_1fr_1.4fr]">
                  <span />
                  <span className="text-gray-600">P/ct</span>
                  <span className="text-gray-600">Total Price</span>
                  {hasCost && (
                    <>
                      <span className="text-gray-500 pt-3">Landed cost</span>
                      <span className="text-gray-700 pt-3">{formatPrice(r.costRate)}</span>
                      <span className="text-gray-700 pt-3">{formatPrice(r.costAmount)}</span>
                    </>
                  )}
                  <span className={`text-gray-600 ${hasCost ? "pt-1.5 font-semibold" : "pt-3"}`}>{hasCost ? "Catalog Price" : "Price"}</span>
                  <span className={`font-semibold text-black ${hasCost ? "pt-1.5" : "pt-3"}`}>{formatPrice(r.rate)}</span>
                  <span className={`font-semibold text-black ${hasCost ? "pt-1.5" : "pt-3"}`}>{formatPrice(r.amount)}</span>
                </div>
                {hasCost && (
                  <div className="pt-2.5 mt-2.5 border-t border-gray-100 space-y-1">
                    <div className="flex items-center justify-between text-gray-500 text-[12px]">
                      <span>Base markup (cost tier)</span>
                      <span>{signed(r.baseMarkupPercent!)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-500 text-[12px]">
                      <span>Color adjustment ({r.color})</span>
                      <span>{signed(r.colorAdjustmentPercent!)} pts</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-500 text-[12px]">
                      <span>Clarity adjustment ({r.clarity})</span>
                      <span>{signed(r.clarityAdjustmentPercent!)} pts</span>
                    </div>
                    {r.largeStoneAdjustmentPercent !== 0 && (
                      <div className="flex items-center justify-between text-gray-500 text-[12px]">
                        <span>Large-stone adjustment</span>
                        <span>{signed(r.largeStoneAdjustmentPercent!)} pts</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-gray-700 text-[12px] font-medium pt-1 border-t border-gray-50">
                      <span>
                        Final markup <span className="text-gray-400 font-normal">(clamped {PRICING_PROFILE.markupFloorPercent}–{PRICING_PROFILE.markupCapPercent}%)</span>
                      </span>
                      <span>{r.finalMarkupPercent}%</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-emerald-700">Margin added</span>
                      <span className="text-emerald-700 font-medium">+{formatPrice(r.marginAmount)}</span>
                    </div>
                  </div>
                )}
                {r.pricingReviewRequired && (
                  <div className="mt-2.5 pt-2.5 border-t border-amber-100 text-[12px] text-amber-700 bg-amber-50 -mx-4 -mb-3 px-4 py-2 rounded-b-xl">
                    ⚠ Pricing review required — catalog price exceeds 60% of the market benchmark
                    {r.marketCeiling != null && ` (ceiling ${formatPrice(r.marketCeiling)})`}.
                  </div>
                )}
              </div>
            )}

            <div className="bg-white rounded-xl mt-5 overflow-hidden">
              <button onClick={() => setDetailsOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <span className="text-lg font-bold text-black">Product Details</span>
                <span className={`text-gray-400 transition ${detailsOpen ? "" : "rotate-180"}`}>⌃</span>
              </button>
              {detailsOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 px-5 py-4 text-[14px]">
                  {[left, right].map((col, i) => (
                    <dl key={i} className="space-y-2.5">
                      {col.map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-2">
                          <dt className="text-gray-600">{k}</dt>
                          <dd className="text-black font-semibold break-words">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

