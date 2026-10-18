// Server-only. Does a stone's photo / video actually exist? Suppliers put
// links on every stone even when they never shot it, and the links still
// "work": the photo URL answers with an empty page, the 360° viewer page
// loads and then shows nothing. So each link is checked for real:
//
// - Photos: must answer with an image.
// - v360-style viewer pages (".../vision360.html?d=STONE", "360.html?d=",
//   "video.html?d=" — Nishal, hd.diamvideo.com, kn360, blissvideos, ...)
//   fetch their frames from ".../imaged/STONE/0.json" next to the page. On
//   hosts known to keep frames there, a 404 means no video. Elsewhere a
//   404 only counts when the stone's photo from that same capture folder
//   (".../imaged/STONE/still.jpg") is missing too.
// - Direct video files (.mp4/.webm/.mov): a 1-byte request must return video.
// - Any other video link (e.g. v360.diamonds pages) counts if it loads.
//
// Every request goes through a per-host limit so a supplier's media server
// isn't flooded (v360.diamonds answers 429 when it is).
//
// Results are stored on the diamond_stock doc (image_ok / video_ok /
// media_rank / media_checked_at). Two things run checks:
// - checkUncheckedOnPage: a catalog page about to be shown checks its own
//   unchecked stones first (lib/diamond-stock-query.ts), so what visitors
//   see is right even before the full pass has reached those stones.
// - verifyMediaBatch: the full pass, which the Diamond Stock admin page runs
//   in short batches after each upload.
import type { Db, ObjectId } from "mongodb";

const TIMEOUT_MS = 15_000;

/** true = exists, false = definitely missing, null = couldn't tell (timeout, network error, 5xx, rate limit). */
export type Check = boolean | null;

/** Starting parallel-request limit per host; halved (down to 1) each time a host answers 429. */
const PER_HOST = 12;
// Measured: v360.diamonds rate-limits (429) at 4+ parallel requests;
// hd.diamvideo.com tops out around 2-3 requests/s however many are sent
// (more in parallel only makes each slower and time out).
const HOST_LIMITS: Record<string, number> = { "v360.diamonds": 2, "hd.diamvideo.com": 6 };
const RATE_LIMIT_PAUSE_MS = 2000;
type HostSlot = { limit: number; active: number; waiting: (() => void)[] };
const hostSlots = new Map<string, HostSlot>();

async function withHostSlot<T>(host: string, fn: (slot: HostSlot) => Promise<T>): Promise<T> {
  let slot = hostSlots.get(host);
  if (!slot) hostSlots.set(host, (slot = { limit: HOST_LIMITS[host] ?? PER_HOST, active: 0, waiting: [] }));
  while (slot.active >= slot.limit) await new Promise<void>((resolve) => slot!.waiting.push(resolve));
  slot.active++;
  try {
    return await fn(slot);
  } finally {
    slot.active--;
    slot.waiting.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `deadline`: epoch ms the caller must be done by — a request never runs past it. */
async function probe(url: string, init: RequestInit | undefined, deadline: number): Promise<Response | null> {
  try {
    return await withHostSlot(new URL(url).host, async (slot) => {
      for (let attempt = 0; ; attempt++) {
        const budget = Math.min(TIMEOUT_MS, deadline - Date.now());
        if (budget < 1000) return null;
        const res = await fetch(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(budget), cache: "no-store" });
        // Only the status and headers are needed — don't download bodies.
        await res.body?.cancel().catch(() => {});
        if (res.status !== 429 || attempt >= 2) return res;
        slot.limit = Math.max(1, Math.floor(slot.limit / 2));
        await sleep(RATE_LIMIT_PAUSE_MS);
      }
    });
  } catch {
    return null;
  }
}

/** GET of the first bytes only — some servers reject HEAD with 403/405 even when the page exists. */
const probeStart = (url: string, deadline: number) => probe(url, { headers: { Range: "bytes=0-1023" } }, deadline);
const okish = (res: Response) => res.ok || res.status === 206;

/** A response that proves nothing either way: no answer, server trouble, or rate limiting. */
const inconclusive = (res: Response | null) => !res || res.status >= 500 || res.status === 429;

function parseHttpUrl(link: unknown): URL | null {
  if (typeof link !== "string" || !link.trim()) return null;
  try {
    const url = new URL(link.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

// Hosts whose viewer always keeps frames at imaged/STONE/0.json beside the page.
const FRAMES_BESIDE_VIEWER = /(^|\.)(v360\.in|diamvideo\.com|kn360\.co\.in)$/i;

/** `imageLink` (optional): the stone's photo link, used to judge viewers on other hosts. */
export async function videoExists(link: unknown, imageLink?: unknown, deadline = Infinity): Promise<Check> {
  const url = parseHttpUrl(link);
  if (!url) return false;

  const stone = /\.html?$/i.test(url.pathname) ? url.searchParams.get("d") : null;
  if (stone) {
    const frames = await probe(new URL(`imaged/${encodeURIComponent(stone)}/0.json`, url).href, { method: "HEAD" }, deadline);
    if (inconclusive(frames)) return null;
    if (frames!.ok) return true;
    if (FRAMES_BESIDE_VIEWER.test(url.host)) return false;
    // Other viewers: no frames beside the page proves nothing on its own, but
    // a missing photo from the same capture folder means nothing was shot.
    const image = parseHttpUrl(imageLink);
    if (image && image.pathname.includes(`/imaged/${stone}/`)) {
      const still = await imageExists(image.href, deadline);
      if (still === false) return false;
    }
  }

  if (/\.(mp4|webm|mov)$/i.test(url.pathname)) {
    const res = await probe(url.href, { headers: { Range: "bytes=0-0" } }, deadline);
    if (inconclusive(res)) return null;
    if (!okish(res!)) return false;
    const type = res!.headers.get("content-type") ?? "";
    return type.startsWith("video/") || type === "application/octet-stream";
  }

  const res = await probeStart(url.href, deadline);
  return inconclusive(res) ? null : okish(res!);
}

export async function imageExists(link: unknown, deadline = Infinity): Promise<Check> {
  const url = parseHttpUrl(link);
  if (!url) return false;
  const res = await probeStart(url.href, deadline);
  if (inconclusive(res)) return null;
  if (!okish(res!)) return false;
  const type = res!.headers.get("content-type") ?? "";
  const length = Number(res!.headers.get("content-length") ?? "1");
  return type.startsWith("image/") && length > 0;
}


/**
 * Catalog ordering bucket: 0 = has a photo or video, 1 = certificate only,
 * 2 = nothing to show. A link not (successfully) checked yet — image_ok /
 * video_ok unset — counts as present.
 */
export function mediaRank(d: Record<string, unknown>): 0 | 1 | 2 {
  const has = (link: unknown) => typeof link === "string" && link.trim() !== "";
  const image = typeof d.image_ok === "boolean" ? d.image_ok : has(d.image_link);
  const video = typeof d.video_ok === "boolean" ? d.video_ok : has(d.video_link);
  if (image || video) return 0;
  return has(d.cert_link) ? 1 : 2;
}

const CONCURRENCY = 64;

/**
 * v360.diamonds gives each stone one capture with a thumbnail link (m=t)
 * and a viewer link (m=d): whether the thumbnail exists answers both, at
 * half the requests to a rate-limited host.
 */
function sameCapture(imageLink: unknown, videoLink: unknown): boolean {
  const i = parseHttpUrl(imageLink);
  const v = parseHttpUrl(videoLink);
  return !!i && !!v && i.host === "v360.diamonds" && v.host === i.host && i.pathname === v.pathname &&
    !!i.searchParams.get("a") && i.searchParams.get("a") === v.searchParams.get("a");
}
/** Inconclusive checks are retried this many times, then the link is assumed to work. */
const MAX_ATTEMPTS = 3;

type StoneMedia = {
  _id: ObjectId;
  image_link?: unknown; video_link?: unknown; cert_link?: unknown;
  image_ok?: unknown; video_ok?: unknown; media_attempts?: unknown;
};
const MEDIA_PROJECTION = { image_link: 1, video_link: 1, cert_link: 1, image_ok: 1, video_ok: 1, media_attempts: 1 } as const;

/**
 * Checks the photo + video of `stones` (up to `concurrency` at a time,
 * never starting work that can't finish by `deadlineMs`) and stores the
 * results. A definite answer is stored as image_ok/video_ok; an
 * inconclusive one is retried later, up to MAX_ATTEMPTS, after which the
 * link is assumed to work. Returns how many stones were checked.
 */
async function verifyStones(db: Db, stones: StoneMedia[], deadlineMs: number, concurrency: number): Promise<number> {
  const updates: { _id: ObjectId; set: Record<string, unknown>; inc: boolean }[] = [];
  const now = new Date();
  const queue = [...stones];
  const hostOf = (d: StoneMedia) => parseHttpUrl(d.image_link)?.host ?? parseHttpUrl(d.video_link)?.host ?? "";
  const hostBusy = (host: string) => {
    const slot = hostSlots.get(host);
    return !!slot && slot.active >= slot.limit;
  };
  // Next stone whose media host has a free slot, so a slow or rate-limited
  // host never holds up stones on other hosts.
  const take = () => {
    const i = queue.findIndex((d) => !hostBusy(hostOf(d)));
    return i === -1 ? null : queue.splice(i, 1)[0];
  };
  // A stone needs at most two sequential requests; don't start one that
  // can't get a fair chance before the deadline.
  const minRunway = Math.min(TIMEOUT_MS, Math.max(2000, (deadlineMs - Date.now()) / 2));
  const worker = async () => {
    while (queue.length && Date.now() + minRunway < deadlineMs) {
      const d = take();
      if (!d) {
        await sleep(50);
        continue;
      }
      const [image, video] = sameCapture(d.image_link, d.video_link)
        ? await imageExists(d.image_link, deadlineMs).then((ok) => [ok, ok] as const)
        : await Promise.all([
            typeof d.image_ok === "boolean" ? d.image_ok : imageExists(d.image_link, deadlineMs),
            typeof d.video_ok === "boolean" ? d.video_ok : videoExists(d.video_link, d.image_link, deadlineMs),
          ]);
      const set: Record<string, unknown> = {};
      if (image !== null) set.image_ok = image;
      if (video !== null) set.video_ok = video;
      const attempts = (Number(d.media_attempts) || 0) + 1;
      const done = (image !== null && video !== null) || attempts >= MAX_ATTEMPTS;
      if (done) set.media_checked_at = now;
      set.media_rank = mediaRank({ ...d, ...set });
      updates.push({ _id: d._id, set, inc: !done });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, stones.length) }, worker));

  if (updates.length) {
    await db.collection("diamond_stock").bulkWrite(
      updates.map(({ _id, set, inc }) => ({
        updateOne: { filter: { _id }, update: { $set: set, ...(inc ? { $inc: { media_attempts: 1 } } : {}) } },
      })),
      { ordered: false }
    );
  }
  return updates.length;
}

/**
 * The full pass: checks not-yet-checked stones (fewest attempts, then
 * on-hand, first) until `deadlineMs` — sized to fit one serverless request.
 */
export async function verifyMediaBatch(
  db: Db,
  // A large pool, so the scheduler always has stones on fast hosts to work
  // on while a slow host's few slots are busy.
  { limit = 8000, deadlineMs = Date.now() + 45_000 }: { limit?: number; deadlineMs?: number } = {}
): Promise<{ checked: number; remaining: number }> {
  const col = db.collection("diamond_stock");
  const pending = (await col
    .find({ media_checked_at: { $exists: false } }, { projection: MEDIA_PROJECTION })
    .sort({ media_attempts: 1, stone_stage: 1 }) // "OH" sorts before "HOLD"/"MEMO"/"TRF"
    .limit(limit)
    .toArray()) as StoneMedia[];
  const checked = await verifyStones(db, pending, deadlineMs, CONCURRENCY);
  const remaining = await col.countDocuments({ media_checked_at: { $exists: false } });
  return { checked, remaining };
}

/**
 * Checks whichever of these stones (a catalog page about to be shown)
 * haven't been checked yet, within `deadlineMs`. Returns how many it
 * checked — if any, the caller re-runs its query, since stones found to
 * have no media now sort lower.
 */
export async function checkUncheckedOnPage(db: Db, ids: ObjectId[], deadlineMs: number): Promise<number> {
  if (!ids.length) return 0;
  const stones = (await db
    .collection("diamond_stock")
    .find({ _id: { $in: ids }, media_checked_at: { $exists: false }, media_attempts: { $exists: false } }, { projection: MEDIA_PROJECTION })
    .toArray()) as StoneMedia[];
  return stones.length ? verifyStones(db, stones, deadlineMs, stones.length) : 0;
}

/**
 * For a stone opened before its check ran: check its video now, store a
 * definite answer (and the stone's new place in the order), and say
 * whether to show it ("couldn't tell" shows it).
 */
export async function stoneVideoAvailable(
  db: Db,
  stone: { _id: unknown; video_link?: unknown; video_ok?: unknown; image_link?: unknown; image_ok?: unknown; cert_link?: unknown }
): Promise<boolean> {
  if (typeof stone.video_ok === "boolean") return stone.video_ok;
  if (typeof stone.video_link !== "string" || !stone.video_link) return false;
  const ok = await videoExists(stone.video_link, stone.image_link, Date.now() + TIMEOUT_MS);
  if (ok !== null) {
    await db
      .collection("diamond_stock")
      .updateOne({ _id: stone._id as ObjectId }, { $set: { video_ok: ok, media_rank: mediaRank({ ...stone, video_ok: ok }) } });
  }
  return ok !== false;
}

/** How long a stored result is reused when a supplier re-uploads the same link. A "missing" result expires sooner, so media added later is noticed. */
const CARRY_OVER_MS = { found: 30 * 86_400_000, missing: 7 * 86_400_000 };

/**
 * Re-uploading a supplier's list replaces all their stones, but their photo
 * and video links are mostly unchanged — so reuse earlier check results for
 * the same link instead of checking everything again. Fills image_ok /
 * video_ok (and media_checked_at when both are known) on `rows` in place.
 */
export async function carryOverMediaChecks(db: Db, rows: Record<string, unknown>[]): Promise<number> {
  const now = Date.now();
  const known = await db
    .collection("diamond_stock")
    .find(
      { media_checked_at: { $exists: true } },
      { projection: { image_link: 1, video_link: 1, image_ok: 1, video_ok: 1, media_checked_at: 1 } }
    )
    .toArray();
  type Result = { ok: boolean; at: number };
  const images = new Map<string, Result>();
  const videos = new Map<string, Result>();
  for (const d of known) {
    const at = new Date(d.media_checked_at).getTime();
    const fresh = (ok: boolean) => now - at < (ok ? CARRY_OVER_MS.found : CARRY_OVER_MS.missing);
    if (typeof d.image_link === "string" && typeof d.image_ok === "boolean" && fresh(d.image_ok)) images.set(d.image_link, { ok: d.image_ok, at });
    if (typeof d.video_link === "string" && typeof d.video_ok === "boolean" && fresh(d.video_ok)) videos.set(d.video_link, { ok: d.video_ok, at });
  }

  let reused = 0;
  const hasLink = (v: unknown): v is string => typeof v === "string" && v !== "";
  for (const r of rows) {
    // No link at all needs no check; otherwise reuse a fresh earlier result.
    const image: Result | undefined = hasLink(r.image_link) ? images.get(r.image_link) : { ok: false, at: now };
    const video: Result | undefined = hasLink(r.video_link) ? videos.get(r.video_link) : { ok: false, at: now };
    if (image && hasLink(r.image_link)) r.image_ok = image.ok;
    if (video && hasLink(r.video_link)) r.video_ok = video.ok;
    if (image && video) {
      // Keep the original check date, so a result still expires on schedule
      // however often the list is re-uploaded.
      r.media_checked_at = new Date(Math.min(image.at, video.at));
      reused++;
    }
  }
  return reused;
}
