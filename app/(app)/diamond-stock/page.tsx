"use client";

import { useEffect, useRef, useState } from "react";

type Stats = { count: number; lastImportedAt: string | null };

export default function DiamondStockPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const [purging, setPurging] = useState(false);

  async function loadStats() {
    setLoading(true);
    const res = await fetch("/api/diamond-stock");
    if (res.ok) setStats(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/diamond-stock/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed.");
      setMessage({
        type: "success",
        text: `Imported ${data.imported} stones${data.skipped ? ` (skipped ${data.skipped} incomplete rows)` : ""}.`,
      });
      await loadStats();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Something went wrong." });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handlePurge() {
    setPurging(true);
    setMessage(null);
    try {
      const res = await fetch("/api/diamond-stock", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purge failed.");
      setMessage({ type: "success", text: `Purged ${data.deleted.toLocaleString()} stones. Upload a new stock list to restore them.` });
      await loadStats();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Something went wrong." });
    } finally {
      setPurging(false);
      setConfirmingPurge(false);
    }
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-[#16283A]">Diamond Stock</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          The certified stone list used to price Solitaire Rings, Three Stone Rings, Solitaire
          Pendants and Studs over 0.5ct. Re-upload whenever the stock list changes — this replaces
          the whole list, and existing shared catalog links keep their already-published prices.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="flex gap-8">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Stones on file</p>
              <p className="text-2xl font-serif text-[#16283A] mt-1">{stats?.count ?? 0}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Last imported</p>
              <p className="text-sm text-[#16283A] mt-1.5">
                {stats?.lastImportedAt ? formatDate(stats.lastImportedAt) : "Never"}
              </p>
            </div>
          </div>
        )}
      </div>

      {message && (
        <div
          className={`mb-4 text-sm rounded-lg px-4 py-3 border ${
            message.type === "success"
              ? "text-green-700 bg-green-50 border-green-200"
              : "text-red-700 bg-red-50 border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Upload stock list (.xlsx)
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
          className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#3E86C6] file:text-white hover:file:bg-[#2f6fa8] disabled:opacity-60"
        />
        <p className="text-xs text-gray-400 mt-2">
          Expects the same columns as the standard stock export — Shape, Carat, Rate, Measurement,
          etc. Rows missing Shape, Carat or Rate are skipped.
        </p>
        {uploading && <p className="text-sm text-[#3E86C6] mt-3">Uploading and replacing stock list…</p>}
      </div>
      <div className="bg-white border border-red-200 rounded-xl p-5 mt-5">
        <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wide mb-1">Danger zone</p>
        <p className="text-sm text-gray-600 mb-3">
          Remove every stone from the database — for example before uploading a fresh stock list.
        </p>
        <button
          onClick={() => setConfirmingPurge(true)}
          disabled={loading || !stats?.count || uploading}
          className="px-4 py-2 text-sm font-semibold rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Purge all diamond data
        </button>
      </div>

      {confirmingPurge && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !purging && setConfirmingPurge(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-xl text-[#16283A] mb-2">Purge all diamond data?</h2>
            <p className="text-sm text-gray-600">
              This will remove all {stats?.count.toLocaleString()} stones from the database, and therefore from{" "}
              <strong>all public catalogs</strong>. If you have shared a catalog link with someone, they might not see any
              diamonds until you upload new stock.
            </p>
            <p className="text-sm text-gray-600 mt-2">
              CAD catalog pricing that relies on certified stones will also fall back to estimates. This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmingPurge(false)}
                disabled={purging}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePurge}
                disabled={purging}
                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-60"
              >
                {purging ? "Purging…" : "Yes, purge everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
