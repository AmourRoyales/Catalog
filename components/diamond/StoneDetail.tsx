"use client";

// Single-stone detail modal — shared by the public catalog viewer
// (app/diamonds/[code]) and the in-app View Diamonds page, so both show the
// exact same thing.
import { useEffect, useState } from "react";
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
  /** Result of the server's video check, once it has run (lib/media-check.ts). */
  video_ok?: boolean;
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
  // Media that doesn't actually load isn't shown at all. Links already
  // checked and found dead never reach here (the server blanks them).
  // Images: the browser tells us (onError). Videos: suppliers link a viewer
  // for every stone, filmed or not, so a stone not yet checked asks the
  // server — the tab only appears once the video is confirmed.
  const [imageOk, setImageOk] = useState(!!r.image_link);
  const [videoOk, setVideoOk] = useState(!!r.video_link && r.video_ok === true);
  useEffect(() => {
    setVideoOk(!!r.video_link && r.video_ok === true);
    if (!r.video_link || typeof r.video_ok === "boolean") return;
    let live = true;
    fetch(`/api/diamonds/stone-video/${encodeURIComponent(r.id)}`)
      .then((res) => (res.ok ? res.json() : { video: false }))
      .then((d: { video?: boolean }) => live && setVideoOk(!!d.video))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [r.id, r.video_link, r.video_ok]);

  const tabs = ([
    { key: "image", label: "Image", available: imageOk },
    { key: "video", label: "Video", available: videoOk },
    { key: "cert", label: "Certificate", available: !!r.cert_link },
  ] as { key: Tab; label: string; available: boolean }[]).filter((t) => t.available);
  const [picked, setPicked] = useState<Tab | null>(null);
  // The picked tab if it's (still) available, else the first that is —
  // e.g. the image failing to load moves the view on to the video.
  const tab: Tab | null = tabs.find((t) => t.key === picked)?.key ?? tabs[0]?.key ?? null;
  const setTab = setPicked;
  const isMp4 = !!r.video_link && /\.(mp4|webm|mov)(\?|$)/i.test(r.video_link);
  // Public video-only page (app/video/[stoneId]) — safe to send to a customer.
  const videoPath = `/video/${encodeURIComponent(r.stone_id)}`;
  const [copied, setCopied] = useState(false);
  const copyVideoLink = async () => {
    const url = `${window.location.origin}${videoPath}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
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
    image: r.image_link ? <img src={r.image_link} alt="" onError={() => setImageOk(false)} className="w-full h-full object-cover" /> : null,
    video: (
      <div className="relative w-full h-full bg-gray-500 flex items-center justify-center">
        {imageOk && r.image_link && <img src={r.image_link} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />}
        <span className="relative w-7 h-7 rounded-full bg-surface flex items-center justify-center text-gray-600 text-xs">▶</span>
      </div>
    ),
    cert: (
      <svg viewBox="0 0 24 24" className="w-7 h-7 text-ink" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="14" height="14" rx="1.5" /><path d="M8 7h6M8 10h6" /><circle cx="16" cy="17" r="3" /><path d="M14.5 19.5 14 23l2-1 2 1-.5-3.5" />
      </svg>
    ),
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="relative bg-subtle-3 rounded-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-surface text-gray-500 hover:bg-gray-100 text-lg leading-none">×</button>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6">
          {/* Media: thumbnails + viewer */}
          <div className="flex gap-3">
            <div className="flex flex-col gap-2 shrink-0">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-lg overflow-hidden border-2 bg-surface flex items-center justify-center"
                  style={{ borderColor: tab === t.key ? BLUE : "transparent" }}
                  title={t.label}
                >
                  {thumbIcon[t.key]}
                </button>
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="aspect-square bg-placeholder-3 rounded-lg overflow-hidden flex items-center justify-center">
                {tab === null && <span className="text-gray-400 text-sm">No image or video</span>}
                {tab === "image" && r.image_link && (
                  <img src={r.image_link} alt={r.stone_id} onError={() => setImageOk(false)} className="w-full h-full object-contain" />
                )}
                {tab === "video" &&
                  (r.video_link ? (
                    isMp4 ? (
                      <video key={r.video_link} src={r.video_link} controls autoPlay loop playsInline onError={() => setVideoOk(false)} className="w-full h-full object-contain" />
                    ) : (
                      <iframe src={r.video_link} title="360° video" className="w-full h-full bg-surface" allow="fullscreen" />
                    )
                  ) : (
                    <span className="text-gray-400 text-sm">No video</span>
                  ))}
                {/* Labs (IGI, GIA) don't allow their report pages inside other
                    sites, so the certificate opens in a new tab instead. */}
                {tab === "cert" && r.cert_link && (
                  <div className="flex flex-col items-center text-center px-6">
                    <svg viewBox="0 0 24 24" className="w-14 h-14 text-ink" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="3" width="14" height="14" rx="1.5" /><path d="M8 7h6M8 10h6" /><circle cx="16" cy="17" r="3" /><path d="M14.5 19.5 14 23l2-1 2 1-.5-3.5" />
                    </svg>
                    <p className="mt-4 text-lg font-semibold text-ink">{r.cert} certified</p>
                    {r.report_no && <p className="mt-1 text-sm text-gray-500">Report # {r.report_no}</p>}
                    <a
                      href={r.cert_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#3E86C6] hover:bg-[#2f6fa8] transition"
                    >
                      View certificate ↗
                    </a>
                  </div>
                )}
              </div>
              {tab === "video" && r.video_link && (
                <div className="flex items-center gap-4 mt-2">
                  <a href={videoPath} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline" style={{ color: BLUE }}>
                    Open video in new tab ↗
                  </a>
                  <button onClick={copyVideoLink} className="text-xs hover:underline" style={{ color: BLUE }}>
                    {copied ? "Link copied ✓" : "Copy video link"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="min-w-0">
            <h2 className="text-3xl font-bold text-gray-950 mt-8 pr-8">
              {titleCase(r.shape)} {Number(r.carat).toFixed(2)}ct {r.color} {r.clarity}
            </h2>
            <p className="text-sm text-gray-600 mt-3">Stock# <span className="font-semibold text-gray-950">{r.stone_id}</span></p>

            {showPrice && (
              <div className="bg-surface rounded-xl border border-gray-200 mt-5 px-4 py-3 text-sm">
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
                  <span className={`font-semibold text-gray-950 ${hasCost ? "pt-1.5" : "pt-3"}`}>{formatPrice(r.rate)}</span>
                  <span className={`font-semibold text-gray-950 ${hasCost ? "pt-1.5" : "pt-3"}`}>{formatPrice(r.amount)}</span>
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

            <div className="bg-surface rounded-xl mt-5 overflow-hidden">
              <button onClick={() => setDetailsOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <span className="text-lg font-bold text-gray-950">Product Details</span>
                <span className={`text-gray-400 transition ${detailsOpen ? "" : "rotate-180"}`}>⌃</span>
              </button>
              {detailsOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 px-5 py-4 text-[14px]">
                  {[left, right].map((col, i) => (
                    <dl key={i} className="space-y-2.5">
                      {col.map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-2">
                          <dt className="text-gray-600">{k}</dt>
                          <dd className="text-gray-950 font-semibold break-words">{v}</dd>
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

