"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { CATEGORIES, SUBCATEGORIES, STONE_SHAPES } from "@/lib/jewelry-options";
import { formatPrice } from "@/lib/format";
import * as XLSX from "xlsx";

type Product = {
  id: string;
  product_code: string;
  name: string;
  category: string;
  subcategory: string | null;
  stone_shape: string | null;
  cover_url: string | null;
};

type UploadResult = {
  updated: number;
  notFoundCodes: string[];
  invalidCodes: string[];
  error?: string;
};

const ALL_STONE_SHAPES: string[] = Array.from(
  new Set(Object.values(STONE_SHAPES).flatMap((s) => s.options))
);

// Strip everything except letters/numbers, lowercase — so "LR-367",
// "lr 367", "LR367" all match the same product.
function normalizeCode(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isNumericCell(v: any): boolean {
  if (typeof v === "number") return isFinite(v);
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    return cleaned.length > 0 && isFinite(Number(cleaned));
  }
  return false;
}

function parsePriceCell(v: any): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return isFinite(n) ? n : null;
  }
  return null;
}

export default function EditCataloguePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loadingCat, setLoadingCat] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [shareToken, setShareToken] = useState("");
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState("");
  const [showPrice, setShowPrice] = useState(true);
  const [showDescription, setShowDescription] = useState(true);
  const [showBranding, setShowBranding] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [stoneFilter, setStoneFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Per-catalogue price overrides: productId -> price
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      // Load the catalogue itself
      const catRes = await fetch(`/api/catalogues/${id}`);
      const cat = catRes.ok ? (await catRes.json()).catalogue : null;

      if (!cat) {
        setNotFound(true);
        setLoadingCat(false);
        setLoading(false);
        return;
      }

      setName(cat.name);
      setShowPrice(cat.show_price);
      setShowDescription(cat.show_description);
      setShowBranding(cat.show_branding);
      setShareToken(cat.share_token);
      setSelectedIds(
        (cat.catalogue_products ?? [])
          .sort((a: any, b: any) => a.display_order - b.display_order)
          .map((cp: any) => cp.product_id)
      );

      const ov: Record<string, number> = {};
      (cat.catalogue_products ?? []).forEach((cp: any) => {
        if (cp.price_override != null) ov[cp.product_id] = cp.price_override;
      });
      setOverrides(ov);

      setLoadingCat(false);

      // Load all active products
      const res = await fetch("/api/products?status=active");
      const data: any[] | null = res.ok ? (await res.json()).products : null;

      if (data) {
        setProducts(
          data.map((p: any) => {
            const sorted = (p.product_media ?? []).sort(
              (a: any, b: any) => a.sort_order - b.sort_order
            );
            return {
              id: p.id,
              product_code: p.product_code,
              name: p.name,
              category: p.category,
              subcategory: p.subcategory,
              stone_shape: p.stone_shape,
              cover_url: sorted[0]?.file_url ?? null,
            };
          })
        );
      }
      setLoading(false);
    }
    load();
  }, [id]);

  function handleCategoryFilterChange(value: string) {
    setCategoryFilter(value);
    setStyleFilter("");
    if (value && stoneFilter && !STONE_SHAPES[value].options.includes(stoneFilter)) {
      setStoneFilter("");
    }
  }

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedIds.includes(p.id)) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.product_code.toLowerCase().includes(q))
        return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (styleFilter && p.subcategory !== styleFilter) return false;
      if (stoneFilter && p.stone_shape !== stoneFilter) return false;
      return true;
    });
  }, [products, selectedIds, search, categoryFilter, styleFilter, stoneFilter]);

  const selected = useMemo(
    () =>
      selectedIds
        .map((sid) => products.find((p) => p.id === sid))
        .filter(Boolean) as Product[],
    [selectedIds, products]
  );

  function add(pid: string) {
    setSelectedIds((prev) => [...prev, pid]);
  }
  function remove(pid: string) {
    setSelectedIds((prev) => prev.filter((x) => x !== pid));
  }
  function move(pid: string, dir: -1 | 1) {
    setSelectedIds((prev) => {
      const i = prev.indexOf(pid);
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function addAllVisible() {
    setSelectedIds((prev) => [...prev, ...available.map((p) => p.id)]);
  }

  function shareUrl() {
    return `${window.location.origin}/catalogue/${shareToken}`;
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Parse the uploaded price list and write catalogue-specific overrides.
  // Only touches products already SAVED in this catalogue — never the
  // product's base price, never other catalogues.
  async function handlePriceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadResult(null);
    setUploading(true);
    setUploadProgress({ done: 0, total: 0 });

    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
      });

      if (rows.length === 0) {
        throw new Error("That file appears to be empty.");
      }

      // Skip row 1 if it looks like a text header rather than a price.
      const startIdx = isNumericCell(rows[0]?.[1]) ? 0 : 1;

      const priceMap = new Map<string, number>();
      const rawByCode = new Map<string, string>();
      const invalidCodes: string[] = [];

      for (let i = startIdx; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const rawCode = row[0];
        const rawPrice = row[1];
        if (rawCode == null || rawCode === "") continue;

        const code = normalizeCode(String(rawCode));
        if (!code) continue;
        rawByCode.set(code, String(rawCode).trim());

        const price = parsePriceCell(rawPrice);
        if (price === null || price < 0) {
          invalidCodes.push(String(rawCode).trim());
          continue;
        }
        priceMap.set(code, price); // duplicate design numbers: last row wins
      }

      // Match against products already in THIS catalogue only.
      const matches: { product: Product; price: number }[] = [];
      const matchedCodes = new Set<string>();
      for (const p of selected) {
        const code = normalizeCode(p.product_code);
        if (priceMap.has(code)) {
          matches.push({ product: p, price: priceMap.get(code)! });
          matchedCodes.add(code);
        }
      }

      const missingFromCatalogue = Array.from(priceMap.keys())
        .filter((c) => !matchedCodes.has(c))
        .map((c) => rawByCode.get(c) ?? c);

      setUploadProgress({ done: 0, total: matches.length });

      let updated = 0;
      const failedWrites: string[] = [];
      const newOverrides = { ...overrides };

      const patchRes = await fetch(`/api/catalogues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price_overrides: Object.fromEntries(matches.map((m) => [m.product.id, m.price])),
        }),
      });
      const updatedIds = new Set<string>(patchRes.ok ? (await patchRes.json()).updatedIds : []);
      for (const { product, price } of matches) {
        if (updatedIds.has(product.id)) {
          updated++;
          newOverrides[product.id] = price;
        } else {
          failedWrites.push(product.product_code);
        }
      }
      setUploadProgress({ done: matches.length, total: matches.length });

      setOverrides(newOverrides);
      setUploadResult({
        updated,
        notFoundCodes: [...missingFromCatalogue, ...failedWrites],
        invalidCodes,
      });
    } catch (err: any) {
      setUploadResult({
        updated: 0,
        notFoundCodes: [],
        invalidCodes: [],
        error: err.message || "Could not read that file.",
      });
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave() {
    setError("");
    if (!name.trim()) return setError("Catalogue name is required.");
    if (selectedIds.length === 0)
      return setError("Add at least one product to the catalogue.");

    setSaving(true);
    try {
      const res = await fetch(`/api/catalogues/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          show_price: showPrice,
          show_description: showDescription,
          show_branding: showBranding,
          products: selectedIds.map((productId) => ({
            product_id: productId,
            price_override: overrides[productId] ?? null,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save the catalogue.");

      router.push("/catalogues");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setSaving(false);
    }
  }

  const catLabel = (v: string) =>
    CATEGORIES.find((c) => c.value === v)?.label ?? v;

  const styleOptions = categoryFilter
    ? SUBCATEGORIES[categoryFilter]?.options ?? []
    : [];
  const stoneOptions = categoryFilter
    ? STONE_SHAPES[categoryFilter]?.options ?? []
    : ALL_STONE_SHAPES;

  if (loadingCat)
    return <div className="p-8 text-sm text-gray-400">Loading catalogue…</div>;
  if (notFound)
    return (
      <div className="p-8">
        <p className="text-gray-500">Catalogue not found.</p>
        <button
          onClick={() => router.push("/catalogues")}
          className="mt-3 text-sm text-[#3E86C6] font-semibold hover:underline"
        >
          ← Back to catalogues
        </button>
      </div>
    );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#16283A]">Edit Catalogue</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Changes apply to the existing share link instantly.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyLink}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button
            onClick={() => router.push("/catalogues")}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm bg-[#3E86C6] hover:bg-[#2f6fa8] text-white font-semibold rounded-lg transition disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Name + toggles */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Catalogue name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3E86C6]"
            />
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2 pb-0.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPrice}
                onChange={(e) => setShowPrice(e.target.checked)}
                className="w-4 h-4 accent-[#3E86C6]"
              />
              <span className="text-sm text-gray-700">Show price to viewers</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDescription}
                onChange={(e) => setShowDescription(e.target.checked)}
                className="w-4 h-4 accent-[#3E86C6]"
              />
              <span className="text-sm text-gray-700">Show description to viewers</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showBranding}
                onChange={(e) => setShowBranding(e.target.checked)}
                className="w-4 h-4 accent-[#3E86C6]"
              />
              <span className="text-sm text-gray-700">Show JeniDiam branding</span>
            </label>
          </div>
        </div>
      </div>

      {/* Catalogue-specific pricing */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-[#16283A]">
              Catalogue-specific pricing
            </h2>
            <p className="text-xs text-gray-500 mt-1 max-w-md">
              Upload an Excel file to set custom prices for THIS catalogue
              only — Column A: design number, Column B: price. A header row
              is fine; we'll detect and skip it. This never touches the
              product's base price, so other catalogues are unaffected.
              Add and save your product list below before uploading —
              prices only apply to products already saved in this catalogue.
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handlePriceFile}
              disabled={uploading}
              className="hidden"
              id="price-upload"
            />
            <label
              htmlFor="price-upload"
              className={`inline-block px-4 py-2 text-sm border border-[#16283A] text-[#16283A] font-semibold rounded-lg transition cursor-pointer hover:bg-[#16283A] hover:text-white ${
                uploading ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {uploading
                ? uploadProgress && uploadProgress.total > 0
                  ? `Updating ${uploadProgress.done} of ${uploadProgress.total}…`
                  : "Reading file…"
                : "↑ Upload price list"}
            </label>
          </div>
        </div>

        {uploadResult && (
          <div className="mt-4 text-sm space-y-1.5">
            {uploadResult.error ? (
              <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {uploadResult.error}
              </p>
            ) : (
              <>
                <p className="text-green-700 font-medium">
                  ✓ {uploadResult.updated} price
                  {uploadResult.updated === 1 ? "" : "s"} updated for this
                  catalogue.
                </p>
                {uploadResult.notFoundCodes.length > 0 && (
                  <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {uploadResult.notFoundCodes.length} design number
                    {uploadResult.notFoundCodes.length === 1 ? "" : "s"} not
                    found in this catalogue:{" "}
                    {uploadResult.notFoundCodes.join(", ")}
                  </p>
                )}
                {uploadResult.invalidCodes.length > 0 && (
                  <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {uploadResult.invalidCodes.length} row
                    {uploadResult.invalidCodes.length === 1 ? "" : "s"} had an
                    unreadable price and were skipped:{" "}
                    {uploadResult.invalidCodes.join(", ")}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Two-panel builder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT — available products */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#16283A] shrink-0">
                All products
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or code…"
                className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3E86C6]"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => handleCategoryFilterChange(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#3E86C6]"
              >
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select
                value={styleFilter}
                onChange={(e) => setStyleFilter(e.target.value)}
                disabled={!categoryFilter}
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#3E86C6] disabled:opacity-40"
              >
                <option value="">All styles</option>
                {styleOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <select
                value={stoneFilter}
                onChange={(e) => setStoneFilter(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#3E86C6]"
              >
                <option value="">All stones</option>
                {stoneOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-gray-400">Loading…</p>
            ) : available.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">
                {products.length === 0
                  ? "No active products in your vault yet."
                  : "No products match — or all are already added."}
              </p>
            ) : (
              available.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#F5F8FB] overflow-hidden shrink-0">
                    {p.cover_url && (
                      <img
                        src={p.cover_url}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#16283A] truncate">
                      {p.name}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {p.product_code} · {catLabel(p.category)}
                      {p.subcategory ? ` · ${p.subcategory}` : ""}
                      {p.stone_shape ? ` · ${p.stone_shape}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => add(p.id)}
                    className="text-lg text-[#3E86C6] font-bold px-2 hover:scale-125 transition"
                    title="Add to catalogue"
                  >
                    +
                  </button>
                </div>
              ))
            )}
          </div>

          {available.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100">
              <button
                onClick={addAllVisible}
                className="text-xs text-[#3E86C6] font-semibold hover:underline"
              >
                + Add all {available.length} shown
              </button>
            </div>
          )}
        </div>

        {/* RIGHT — selected products */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#16283A]">
              In this catalogue
            </span>
            <span className="text-xs text-gray-400">
              {selected.length} products
            </span>
          </div>

          <div className="max-h-[460px] overflow-y-auto">
            {selected.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">
                Nothing here yet — add products from the left panel.
              </p>
            ) : (
              selected.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50"
                >
                  <span className="text-[11px] text-gray-300 w-5 text-right shrink-0">
                    {i + 1}
                  </span>
                  <div className="w-9 h-9 rounded-lg bg-[#F5F8FB] overflow-hidden shrink-0">
                    {p.cover_url && (
                      <img
                        src={p.cover_url}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#16283A] truncate">
                      {p.name}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {p.product_code}
                    </p>
                  </div>
                  {overrides[p.id] != null && (
                    <span
                      title="Catalogue-specific price"
                      className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-semibold shrink-0"
                    >
                      {formatPrice(overrides[p.id])}
                    </span>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => move(p.id, -1)}
                      disabled={i === 0}
                      className="text-xs text-gray-400 hover:text-[#16283A] px-1 disabled:opacity-20 transition"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => move(p.id, 1)}
                      disabled={i === selected.length - 1}
                      className="text-xs text-gray-400 hover:text-[#16283A] px-1 disabled:opacity-20 transition"
                      title="Move down"
                    >
                      ▼
                    </button>
                    <button
                      onClick={() => remove(p.id)}
                      className="text-lg text-red-400 font-bold px-1.5 hover:text-red-600 transition"
                      title="Remove"
                    >
                      −
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}