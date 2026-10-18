import { afterEach, describe, expect, it, vi } from "vitest";
import { carryOverMediaChecks, imageExists, mediaRank, videoExists } from "./media-check";

/** Fake fetch: url -> [status, content-type]; anything unlisted is a 404. */
function serve(routes: Record<string, [number, string?]>) {
  const fetchMock = vi.fn(async (url: string) => {
    const [status, type] = routes[url] ?? [404, "text/html"];
    return new Response(status === 204 ? null : "x", { status, headers: { "content-type": type ?? "text/html" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
afterEach(() => vi.unstubAllGlobals());

describe("mediaRank", () => {
  it("media first, then certificate only, then nothing", () => {
    expect(mediaRank({ image_link: "https://a/x.jpg", image_ok: true })).toBe(0);
    expect(mediaRank({ video_link: "https://a/v", video_ok: true, image_link: "https://a/x.jpg", image_ok: false })).toBe(0);
    expect(mediaRank({ image_link: "https://a/x.jpg", image_ok: false, cert_link: "https://igi" })).toBe(1);
    expect(mediaRank({ image_link: "https://a/x.jpg", image_ok: false })).toBe(2);
  });
  it("an unchecked link counts as present", () => {
    expect(mediaRank({ image_link: "https://a/x.jpg" })).toBe(0);
  });
});

describe("imageExists", () => {
  it("needs an actual image", async () => {
    serve({ "https://v360.in/i?d=A": [200, "image/jpeg"], "https://v360.in/i?d=B": [200, "text/html"] });
    expect(await imageExists("https://v360.in/i?d=A")).toBe(true);
    expect(await imageExists("https://v360.in/i?d=B")).toBe(false); // empty page instead of a photo
    expect(await imageExists("https://v360.in/i?d=C")).toBe(false); // 404
  });
  it("server trouble is inconclusive, not missing", async () => {
    serve({ "https://h/x.jpg": [503] });
    expect(await imageExists("https://h/x.jpg")).toBeNull();
  });
});

describe("videoExists", () => {
  it("v360 viewer on a known host: frames file decides", async () => {
    serve({ "https://x.v360.in/imaged/A/0.json": [200, "application/json"] });
    expect(await videoExists("https://x.v360.in/vision360.html?d=A")).toBe(true);
    expect(await videoExists("https://x.v360.in/vision360.html?d=B")).toBe(false);
  });
  it("viewer on another host: no frames + missing photo from the same capture = no video", async () => {
    serve({ "https://bliss.example/video.html?d=A": [200, "text/html"] });
    expect(await videoExists("https://bliss.example/video.html?d=A", "https://bliss.example/imaged/A/still.jpg")).toBe(false);
  });
  it("viewer on another host with a working photo still counts if the page loads", async () => {
    serve({
      "https://bliss.example/video.html?d=A": [206, "text/html"],
      "https://bliss.example/imaged/A/still.jpg": [206, "image/jpeg"],
    });
    expect(await videoExists("https://bliss.example/video.html?d=A", "https://bliss.example/imaged/A/still.jpg")).toBe(true);
  });
  it("mp4 must be a video", async () => {
    serve({ "https://cdn/v.mp4": [206, "video/mp4"], "https://cdn/w.mp4": [200, "application/xml"] });
    expect(await videoExists("https://cdn/v.mp4")).toBe(true);
    expect(await videoExists("https://cdn/w.mp4")).toBe(false);
  });
  it("other pages: loads = exists; 402/404 = missing", async () => {
    serve({ "https://v360.diamonds/c/1?m=d&a=A": [200, "text/html"], "https://v360.diamonds/c/1?m=d&a=B": [402, "text/html"] });
    expect(await videoExists("https://v360.diamonds/c/1?m=d&a=A")).toBe(true);
    expect(await videoExists("https://v360.diamonds/c/1?m=d&a=B")).toBe(false);
  });
  it("no link or a bad link is missing", async () => {
    serve({});
    expect(await videoExists(null)).toBe(false);
    expect(await videoExists("not a url")).toBe(false);
  });
});

describe("carryOverMediaChecks", () => {
  const day = 86_400_000;
  const fakeDb = (docs: Record<string, unknown>[]) =>
    ({ collection: () => ({ find: () => ({ toArray: async () => docs }) }) }) as unknown as Parameters<typeof carryOverMediaChecks>[0];

  it("reuses fresh results for unchanged links and keeps the original check date", async () => {
    const checkedAt = new Date(Date.now() - 2 * day);
    const rows: Record<string, unknown>[] = [
      { image_link: "https://h/a.jpg", video_link: "https://h/a.html?d=a" }, // both known
      { image_link: "https://h/b.jpg", video_link: "https://h/new.html?d=b" }, // video link changed
    ];
    const reused = await carryOverMediaChecks(
      fakeDb([
        { image_link: "https://h/a.jpg", video_link: "https://h/a.html?d=a", image_ok: true, video_ok: false, media_checked_at: checkedAt },
        { image_link: "https://h/b.jpg", video_link: "https://h/b.html?d=b", image_ok: true, video_ok: true, media_checked_at: checkedAt },
      ]),
      rows
    );
    expect(reused).toBe(1);
    expect(rows[0]).toMatchObject({ image_ok: true, video_ok: false, media_checked_at: checkedAt });
    expect(rows[1]).toMatchObject({ image_ok: true });
    expect(rows[1].video_ok).toBeUndefined();
    expect(rows[1].media_checked_at).toBeUndefined(); // still needs its new video checked
  });

  it("lets a 'missing' result expire after a week so newly added media is noticed", async () => {
    const rows: Record<string, unknown>[] = [{ image_link: "https://h/a.jpg" }];
    await carryOverMediaChecks(
      fakeDb([{ image_link: "https://h/a.jpg", image_ok: false, media_checked_at: new Date(Date.now() - 8 * day) }]),
      rows
    );
    expect(rows[0].image_ok).toBeUndefined();
  });
});
