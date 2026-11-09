import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CadCatalogInput } from "@/lib/cad-catalog";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), catalog: vi.fn(), update: vi.fn(), insert: vi.fn(), remove: vi.fn(), markOld: vi.fn(), findItems: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.user,
  unauthorized: () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
}));
vi.mock("@/lib/mongo", () => ({
  getDb: async () => ({ collection: (name: string) => name === "cad_catalogs"
    ? { findOne: mocks.catalog, updateOne: mocks.update }
    : { insertMany: mocks.insert, deleteMany: mocks.remove, updateMany: mocks.markOld, find: mocks.findItems } }),
  newId: () => "new-revision",
  serialize: ({ _id, ...rest }: { _id: string }) => ({ id: _id, ...rest }),
}));
vi.mock("@/lib/cad-designs", () => ({ getCadDesignById: () => null }));

import { GET, PUT } from "./route";

function input(): CadCatalogInput {
  return {
    name: "Cuban Designs", metals: ["14k"], extra_percent: 10, show_price: false, show_branding: true,
    filters: { categories: ["Necklace"], datasets: ["luxe"], search: "Cuban", mode: "AND", priceMin: "", priceMax: "" },
    items: [{ design_id: "new-necklace", dataset: "luxe", collection: "Necklace Set", design_code: "NS-01",
      design_type: "Necklace", cad_url: "https://example.com/cad.png", display_order: 99,
      prices: { "14k": { price: 123, certifiedSource: null } } }],
  };
}

const params = { params: { id: "catalog-1" } };
const request = (body: unknown) => new Request("http://localhost/api/cad-catalogs/catalog-1", { method: "PUT", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "user" });
  mocks.catalog.mockResolvedValue({ _id: "catalog-1", name: "Old catalog", code: "same-share-code", status: "archived" });
  mocks.insert.mockResolvedValue({});
  mocks.update.mockResolvedValue({ matchedCount: 1 });
  mocks.remove.mockResolvedValue({});
  mocks.markOld.mockResolvedValue({});
});

describe("CAD catalog edit API", () => {
  it("loads an older catalog's ordered selection even when designs have left the library", async () => {
    const items = [{ _id: "item-1", design_id: "old-bracelet", display_order: 0, prices: { "14k": { price: 90 } } }];
    const sort = vi.fn(() => ({ toArray: async () => items }));
    mocks.findItems.mockReturnValue({ sort });
    const response = await GET(request({}), params);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.catalog.code).toBe("same-share-code");
    expect(body.items[0]).toMatchObject({ design_id: "old-bracelet", tags: [], prices: { "14k": { price: 90 } } });
    expect(mocks.findItems).toHaveBeenCalledWith({ catalog_id: "catalog-1", item_revision: { $exists: false } });
    expect(sort).toHaveBeenCalledWith({ display_order: 1 });
  });

  it("replaces the selection and settings while retaining the share code and archive status", async () => {
    const response = await PUT(request(input()), params);
    expect(response.status).toBe(200);
    expect(mocks.insert.mock.calls[0][0]).toEqual([expect.objectContaining({
      catalog_id: "catalog-1", item_revision: "new-revision", design_id: "new-necklace", display_order: 0,
    })]);
    const update = mocks.update.mock.calls[0][1].$set;
    expect(update).toMatchObject({ name: "Cuban Designs", show_price: false, item_revision: "new-revision", categories: ["Necklace"] });
    expect(update).not.toHaveProperty("code");
    expect(update).not.toHaveProperty("status");
    expect(mocks.insert.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
  });

  it("does not replace the current catalog when writing new designs fails", async () => {
    mocks.insert.mockRejectedValueOnce(new Error("Database write failed"));
    const response = await PUT(request(input()), params);
    expect(response.status).toBe(500);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith({ catalog_id: "catalog-1", item_revision: "new-revision" });
  });

  it("rejects a stale edit before writing items", async () => {
    mocks.catalog.mockResolvedValueOnce({ _id: "catalog-1", item_revision: "someone-elses-edit" });
    expect((await PUT(request(input()), params)).status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("discards only staged items when another save wins the update race", async () => {
    mocks.update.mockResolvedValueOnce({ matchedCount: 0 });
    expect((await PUT(request(input()), params)).status).toBe(409);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith({ catalog_id: "catalog-1", item_revision: "new-revision" });
  });

  it("requires authentication and rejects missing or empty catalogs", async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect((await PUT(request(input()), params)).status).toBe(401);
    expect((await PUT(request({ ...input(), items: [] }), params)).status).toBe(400);
    mocks.catalog.mockResolvedValueOnce(null);
    expect((await PUT(request(input()), params)).status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
