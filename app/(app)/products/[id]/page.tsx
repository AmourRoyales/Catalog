"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CATEGORIES, SUBCATEGORIES, STONE_SHAPES } from "@/lib/jewelry-options";

type ExistingMedia = {
  id: string;
  file_url: string;
  r2_key: string;
  media_type: string;
  sort_order: number;
};

type NewMediaItem = {
  file: File;
  previewUrl: string;
  progress: number;
  status: "pending" | "uploading" | "done";
  key?: string;
  publicUrl?: string;
};

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [stoneShape, setStoneShape] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "active">("active");

  const [existingMedia, setExistingMedia] = useState<ExistingMedia[]>([]);
  const [removedMedia, setRemovedMedia] = useState<ExistingMedia[]>([]);
  const [newMedia, setNewMedia] = useState<NewMediaItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/products/${id}`);
      const data = res.ok ? (await res.json()).product : null;

      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setName(data.name);
      setProductCode(data.product_code);
      setCategory(data.category);
      setSubcategory(data.subcategory ?? "");
      setStoneShape(data.stone_shape ?? "");
      setPrice(data.price != null ? String(data.price) : "");
      setDescription(data.description ?? "");
      setStatus(data.status);
      setExistingMedia(
        (data.product_media ?? []).sort(
          (a: ExistingMedia, b: ExistingMedia) => a.sort_order - b.sort_order
        )
      );
      setLoading(false);
    }
    load();
  }, [id]);

  function handleCategoryChange(value: string) {
    setCategory(value);
    setSubcategory("");
    setStoneShape("");
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const items: NewMediaItem[] = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: "pending",
    }));
    setNewMedia((prev) => [...prev, ...items]);
  }

  function removeExisting(m: ExistingMedia) {
    setExistingMedia((prev) => prev.filter((x) => x.id !== m.id));
    setRemovedMedia((prev) => [...prev, m]);
  }

  function makeCover(index: number) {
    setExistingMedia((prev) => {
      const item = prev[index];
      return [item, ...prev.filter((_, i) => i !== index)];
    });
  }

  function uploadFile(item: NewMediaItem, index: number): Promise<NewMediaItem> {
    return new Promise(async (resolve, reject) => {
      try {
        const res = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: item.file.name,
            contentType: item.file.type,
            productCode: productCode.trim(),
          }),
        });
        if (!res.ok) throw new Error("Could not get upload URL");
        const { uploadUrl, key, publicUrl } = await res.json();

        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", item.file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setNewMedia((prev) =>
              prev.map((m, i) =>
                i === index ? { ...m, progress: pct, status: "uploading" } : m
              )
            );
          }
        };
        xhr.onload = () => {
          if (xhr.status === 200) {
            const done: NewMediaItem = {
              ...item,
              progress: 100,
              status: "done",
              key,
              publicUrl,
            };
            setNewMedia((prev) => prev.map((m, i) => (i === index ? done : m)));
            resolve(done);
          } else reject(new Error("Upload failed"));
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(item.file);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function handleSave() {
    setError("");
    if (!name.trim()) return setError("Product name is required.");
    if (!productCode.trim()) return setError("Product code is required.");
    if (!category) return setError("Please select a category.");

    setSaving(true);
    try {
      // 1. Delete removed media from R2 (the DB list is rewritten in step 3)
      if (removedMedia.length > 0) {
        await fetch("/api/delete-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: removedMedia.map((m) => m.r2_key) }),
        });
      }

      // 2. Upload new media
      const uploaded: NewMediaItem[] = [];
      for (let i = 0; i < newMedia.length; i++) {
        if (newMedia[i].status === "done") uploaded.push(newMedia[i]);
        else uploaded.push(await uploadFile(newMedia[i], i));
      }

      // 3. Save product fields + media order (existing in order, then new)
      const res = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_code: productCode.trim(),
          name: name.trim(),
          category,
          subcategory: subcategory || null,
          stone_shape: stoneShape || null,
          price: price ? Number(price.replace(/,/g, "")) : null,
          description: description.trim() || null,
          status,
          keep_media_ids: existingMedia.map((m) => m.id),
          new_media: uploaded.map((m) => ({
            media_type: m.file.type.startsWith("video") ? "video" : "photo",
            file_url: m.publicUrl!,
            r2_key: m.key!,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not save the product.");
      }

      router.push("/products");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    const sure = window.confirm(
      `Delete "${name}" permanently? This removes the product and all its photos/videos. This cannot be undone.`
    );
    if (!sure) return;

    setDeleting(true);
    try {
      const allKeys = [...existingMedia, ...removedMedia].map((m) => m.r2_key);
      if (allKeys.length > 0) {
        await fetch("/api/delete-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: allKeys }),
        });
      }
      await fetch(`/api/products/${id}`, { method: "DELETE" });
      router.push("/products");
      router.refresh();
    } catch {
      setError("Could not delete the product.");
      setDeleting(false);
    }
  }

  if (loading)
    return <div className="p-8 text-sm text-gray-400">Loading product…</div>;
  if (notFound)
    return (
      <div className="p-8">
        <p className="text-gray-500">Product not found.</p>
        <button
          onClick={() => router.push("/products")}
          className="mt-3 text-sm text-[#3E86C6] font-semibold hover:underline"
        >
          ← Back to products
        </button>
      </div>
    );

  const subOptions = category ? SUBCATEGORIES[category] : null;
  const stoneOptions = category ? STONE_SHAPES[category] : null;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#16283A]">Edit Product</h1>
          <p className="text-sm text-gray-500 mt-0.5">{productCode}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button
            onClick={() => router.push("/products")}
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
        {/* LEFT — details */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-[#16283A] pb-3 mb-4 border-b border-gray-100">
            Basic information
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Product name *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3E86C6]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Product code *
              </label>
              <input
                value={productCode}
                onChange={(e) => setProductCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3E86C6]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#3E86C6]"
              >
                <option value="">Select…</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={category ? "" : "opacity-40 pointer-events-none"}>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {subOptions?.label ?? "Style"}
              </label>
              <select
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#3E86C6]"
              >
                <option value="">Select…</option>
                {subOptions?.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className={category ? "" : "opacity-40 pointer-events-none"}>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {stoneOptions?.label ?? "Stone shape"}
              </label>
              <select
                value={stoneShape}
                onChange={(e) => setStoneShape(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#3E86C6]"
              >
                <option value="">Select…</option>
                {stoneOptions?.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Price ($)
              </label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3E86C6]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Status
              </label>
              <div className="flex gap-2 mt-0.5">
                <button
                  type="button"
                  onClick={() => setStatus("active")}
                  className={`px-4 py-1.5 rounded-lg text-sm border transition ${
                    status === "active"
                      ? "bg-[#16283A] text-white border-[#16283A]"
                      : "bg-white text-gray-500 border-gray-300"
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("draft")}
                  className={`px-4 py-1.5 rounded-lg text-sm border transition ${
                    status === "draft"
                      ? "bg-[#16283A] text-white border-[#16283A]"
                      : "bg-white text-gray-500 border-gray-300"
                  }`}
                >
                  Draft
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3E86C6] resize-y"
            />
          </div>
        </div>

        {/* RIGHT — media */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-[#16283A] pb-3 mb-4 border-b border-gray-100">
            Media
          </h2>

          {existingMedia.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {existingMedia.map((m, i) => (
                <div
                  key={m.id}
                  onClick={() => makeCover(i)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer ${
                    i === 0 ? "border-[#3E86C6]" : "border-transparent"
                  }`}
                >
                  {m.media_type === "video" ? (
                    <video src={m.file_url} className="w-full h-full object-cover" muted playsInline />
                  ) : (
                    <img src={m.file_url} className="w-full h-full object-cover" alt="" />
                  )}
                  {i === 0 && (
                    <span className="absolute bottom-0 inset-x-0 bg-[#3E86C6] text-white text-[9px] font-bold text-center py-0.5">
                      COVER
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeExisting(m);
                    }}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs leading-none hover:bg-red-600 transition"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
            className="border-2 border-dashed border-[#3E86C6]/50 rounded-xl p-5 text-center cursor-pointer hover:bg-[#3E86C6]/5 transition"
          >
            <p className="text-sm font-semibold text-gray-600">Add more media</p>
            <p className="text-xs text-gray-400 mt-1">Drop files or click to browse</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />

          {newMedia.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {newMedia.map((m, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
                  {m.file.type.startsWith("video") ? (
                    <video src={m.previewUrl} className="w-full h-full object-cover" muted playsInline />
                  ) : (
                    <img src={m.previewUrl} className="w-full h-full object-cover" alt="" />
                  )}
                  {m.status === "uploading" && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">{m.progress}%</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setNewMedia((prev) => prev.filter((_, x) => x !== i))
                    }
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs leading-none hover:bg-red-600 transition"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-gray-400 mt-3">
            Click a thumbnail to set it as the cover. New files upload when you save.
          </p>
        </div>
      </div>
    </div>
  );
}