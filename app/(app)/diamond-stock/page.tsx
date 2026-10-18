"use client";

import { useEffect, useRef, useState } from "react";

type Supplier = {
  id: string | null; // null = stones uploaded before suppliers existed
  name: string;
  count: number;
  shown: number;
  lastImportedAt: string | null;
};
type Stats = { count: number; lastImportedAt: string | null; suppliers: Supplier[] };
type Message = { type: "success" | "error"; text: string; details?: string[] };
type Confirm = { title: string; body: React.ReactNode; confirmLabel: string; run: () => Promise<void> };

const FIELD_LABEL: Record<string, string> = {
  stone_id: "Stone ID", report_no: "Certificate number", color: "Color", clarity: "Clarity",
  measurement: "Measurement", cert: "Lab",
};

export default function DiamondStockPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // label of the running action
  const [message, setMessage] = useState<Message | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [newSupplier, setNewSupplier] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<Supplier | null>(null);

  async function loadStats() {
    setLoading(true);
    const res = await fetch("/api/diamond-stock");
    if (res.ok) setStats(await res.json());
    setLoading(false);
  }

  // Photo/video checks (lib/media-check.ts) run in batches from this page
  // while it's open — after an upload, or to finish a check left running.
  const [mediaRemaining, setMediaRemaining] = useState<number | null>(null);
  const [mediaPaused, setMediaPaused] = useState(false);
  const mediaRunning = useRef(false);
  const mounted = useRef(true);

  async function checkMedia() {
    if (mediaRunning.current) return;
    mediaRunning.current = true;
    setMediaPaused(false);
    try {
      const first = await fetch("/api/diamond-stock/verify-media");
      if (!first.ok) throw new Error();
      let { remaining } = (await first.json()) as { remaining: number };
      setMediaRemaining(remaining);
      while (remaining > 0 && mounted.current) {
        const res = await fetch("/api/diamond-stock/verify-media", { method: "POST" });
        if (!res.ok) throw new Error();
        ({ remaining } = (await res.json()) as { remaining: number });
        setMediaRemaining(remaining);
      }
    } catch {
      setMediaPaused(true);
    } finally {
      mediaRunning.current = false;
    }
  }

  useEffect(() => {
    mounted.current = true;
    loadStats();
    checkMedia();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(label: string, action: () => Promise<Message>) {
    setBusy(label);
    setMessage(null);
    try {
      setMessage(await action());
      await loadStats();
      checkMedia();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  async function call(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  function startUpload(supplier: Supplier) {
    uploadTarget.current = supplier;
    fileInputRef.current?.click();
  }

  function handleUpload(file: File) {
    const supplier = uploadTarget.current!;
    run(`Uploading ${supplier.name}'s stock list…`, async () => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("supplierId", supplier.id!);
      const data = await call("/api/diamond-stock/import", { method: "POST", body: formData });
      const details: string[] = [];
      if (data.onHand < data.imported) {
        details.push(`${(data.imported - data.onHand).toLocaleString()} are on hold / memo and won't show in catalogs.`);
      }
      if (data.duplicatesSkipped) {
        details.push(
          `Not stored: ${data.duplicatesSkipped.toLocaleString()} stones another supplier already has at the same or lower cost (same certificate number).`
        );
      }
      if (data.displaced) {
        details.push(
          `Replaced ${data.displaced.toLocaleString()} other suppliers' copies of the same stones, which this list has available cheaper.`
        );
      }
      if (data.duplicatesInFile) {
        details.push(`${data.duplicatesInFile.toLocaleString()} certificate numbers appeared twice in this file — stored once.`);
      }
      if (data.skipped) details.push(`Skipped ${data.skipped} rows with no shape, carat or price.`);
      if (data.missingFields.length) {
        details.push(`No column found for: ${data.missingFields.map((f: string) => FIELD_LABEL[f] ?? f).join(", ")}.`);
      }
      if (data.ignoredHeaders.length) details.push(`Columns not used: ${data.ignoredHeaders.join(", ")}.`);
      return {
        type: "success",
        text: `${supplier.name}: imported ${data.imported.toLocaleString()} stones from sheet "${data.sheetName}"${
          data.replaced ? `, replacing their previous ${data.replaced.toLocaleString()}` : ""
        }.`,
        details,
      };
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function addSupplier(e: React.FormEvent) {
    e.preventDefault();
    const name = newSupplier.trim();
    if (!name) return;
    run("Adding supplier…", async () => {
      await call("/api/diamond-stock/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setNewSupplier("");
      return { type: "success", text: `Added ${name}. Upload their stock list from the table.` };
    });
  }

  function purgeSupplier(s: Supplier) {
    setConfirm({
      title: `Purge ${s.name}'s stones?`,
      body: (
        <>
          This removes {s.count.toLocaleString()} stones from {s.name} — they disappear from{" "}
          <strong>all public catalogs</strong> right away. Other suppliers&apos; stones stay.
        </>
      ),
      confirmLabel: "Yes, purge",
      run: () =>
        run(`Purging ${s.name}…`, async () => {
          const data = await call(`/api/diamond-stock?supplier=${s.id ?? "unassigned"}`, { method: "DELETE" });
          return { type: "success", text: `Purged ${data.deleted.toLocaleString()} stones from ${s.name}.` };
        }),
    });
  }

  function deleteSupplier(s: Supplier) {
    setConfirm({
      title: `Remove supplier ${s.name}?`,
      body: s.count ? (
        <>This also removes their {s.count.toLocaleString()} stones from <strong>all public catalogs</strong>.</>
      ) : (
        <>They have no stones on file.</>
      ),
      confirmLabel: "Yes, remove",
      run: () =>
        run(`Removing ${s.name}…`, async () => {
          await call(`/api/diamond-stock/suppliers/${s.id}`, { method: "DELETE" });
          return { type: "success", text: `Removed ${s.name}.` };
        }),
    });
  }

  function assignUnassigned(target: Supplier) {
    run("Assigning stones…", async () => {
      const data = await call("/api/diamond-stock", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignUnassignedTo: target.id }),
      });
      return { type: "success", text: `Moved ${data.assigned.toLocaleString()} stones under ${target.name}.` };
    });
  }

  function purgeAll() {
    setConfirm({
      title: "Purge all diamond data?",
      body: (
        <>
          This will remove all {stats?.count.toLocaleString()} stones from every supplier, and therefore from{" "}
          <strong>all public catalogs</strong>. CAD catalog pricing that relies on certified stones will also fall back
          to estimates. This can&apos;t be undone.
        </>
      ),
      confirmLabel: "Yes, purge everything",
      run: () =>
        run("Purging all stones…", async () => {
          const data = await call("/api/diamond-stock", { method: "DELETE" });
          return { type: "success", text: `Purged ${data.deleted.toLocaleString()} stones.` };
        }),
    });
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

  const suppliers = stats?.suppliers ?? [];
  const named = suppliers.filter((s) => s.id);
  const disabled = !!busy;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-ink">Diamond Stock</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Certified stones from each supplier, used by the diamond catalogs and to price Solitaire Rings, Three Stone
          Rings, Solitaire Pendants and Studs over 0.5ct. Uploading a supplier&apos;s list replaces only that
          supplier&apos;s stones. Each stone is stored only once: if two suppliers list the same certificate number,
          only the copy that&apos;s available at the lower cost is kept.
        </p>
      </div>

      <div className="bg-surface border border-gray-200 rounded-xl p-5 mb-5">
        {loading && !stats ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="flex gap-8">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Stones on file</p>
              <p className="text-2xl font-serif text-ink mt-1">{(stats?.count ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Suppliers</p>
              <p className="text-2xl font-serif text-ink mt-1">{named.length}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Last imported</p>
              <p className="text-sm text-ink mt-1.5">
                {stats?.lastImportedAt ? formatDate(stats.lastImportedAt) : "Never"}
              </p>
            </div>
          </div>
        )}
      </div>

      {!!mediaRemaining && (
        <div className="mb-4 text-sm rounded-lg px-4 py-3 border border-[#3E86C6]/30 bg-tint text-ink flex items-center justify-between gap-4">
          <p>
            {mediaPaused ? "Photo & video check paused" : "Checking photos & videos"} —{" "}
            <strong>{mediaRemaining.toLocaleString()}</strong> stones left.
            <span className="text-gray-500">
              {" "}
              Keep this page open until it finishes. Stones keep showing their media until they&apos;re checked; then
              catalogs list stones with working photos or videos first.
            </span>
          </p>
          {mediaPaused && (
            <button
              onClick={checkMedia}
              className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#3E86C6] text-white hover:bg-[#2f6fa8] transition"
            >
              Resume
            </button>
          )}
        </div>
      )}
      {busy && <p className="mb-4 text-sm text-[#3E86C6]">{busy}</p>}
      {message && (
        <div
          className={`mb-4 text-sm rounded-lg px-4 py-3 border ${
            message.type === "success"
              ? "text-green-700 bg-green-50 border-green-200"
              : "text-red-700 bg-red-50 border-red-200"
          }`}
        >
          <p>{message.text}</p>
          {!!message.details?.length && (
            <ul className="mt-1.5 list-disc pl-5 text-gray-600 space-y-0.5">
              {message.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />

      <div className="bg-surface border border-gray-200 rounded-xl mb-5 overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Suppliers</p>
        </div>
        {suppliers.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-gray-400">No suppliers yet — add one below, then upload their stock list.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wide border-y border-gray-100 bg-gray-50">
                  <th className="px-5 py-2 font-semibold">Supplier</th>
                  <th className="px-3 py-2 font-semibold text-right">Stones</th>
                  <th className="px-3 py-2 font-semibold text-right">Shown</th>
                  <th className="px-3 py-2 font-semibold">Last imported</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id ?? "unassigned"} className="border-b border-gray-100 last:border-0">
                    <td className="px-5 py-3">
                      <p className={s.id ? "text-ink font-medium" : "text-gray-500 italic"}>{s.name}</p>
                      {!s.id && <p className="text-xs text-gray-400">Uploaded before suppliers existed</p>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.count.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right tabular-nums" title="On hand — shown in catalogs">
                      {s.shown.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                      {s.lastImportedAt ? formatDate(s.lastImportedAt) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        {s.id ? (
                          <>
                            <button
                              onClick={() => startUpload(s)}
                              disabled={disabled}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#3E86C6] text-white hover:bg-[#2f6fa8] transition disabled:opacity-50"
                            >
                              Upload list
                            </button>
                            <button
                              onClick={() => purgeSupplier(s)}
                              disabled={disabled || !s.count}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                            >
                              Purge
                            </button>
                            <button
                              onClick={() => deleteSupplier(s)}
                              disabled={disabled}
                              title="Remove supplier"
                              className="px-2 py-1.5 text-xs rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </>
                        ) : (
                          <>
                            {named.length > 0 && (
                              <select
                                value=""
                                disabled={disabled}
                                onChange={(e) => {
                                  const target = named.find((n) => n.id === e.target.value);
                                  if (target) assignUnassigned(target);
                                }}
                                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-600 bg-surface disabled:opacity-50"
                              >
                                <option value="">Assign to…</option>
                                {named.map((n) => (
                                  <option key={n.id} value={n.id!}>
                                    {n.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() => purgeSupplier(s)}
                              disabled={disabled}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                            >
                              Purge
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={addSupplier} className="flex gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50/50">
          <input
            value={newSupplier}
            onChange={(e) => setNewSupplier(e.target.value)}
            placeholder="New supplier name, e.g. Nishal Gems"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#3E86C6]"
          />
          <button
            type="submit"
            disabled={disabled || !newSupplier.trim()}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#3E86C6] text-[#3E86C6] hover:bg-[#3E86C6]/5 transition disabled:opacity-40"
          >
            Add supplier
          </button>
        </form>
        <p className="px-5 pb-4 bg-gray-50/50 text-xs text-gray-400">
          Any supplier&apos;s Excel layout works — columns are recognised by name (Carat / Size / Cts, Rate / Per Carat,
          Cert Number / Report No, …). After each upload you&apos;ll see which columns weren&apos;t used, so you can check a
          new supplier&apos;s sheet came through properly. Rows missing shape, carat or price are skipped.
        </p>
      </div>

      <div className="bg-surface border border-red-200 rounded-xl p-5">
        <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wide mb-1">Danger zone</p>
        <p className="text-sm text-gray-600 mb-3">Remove every stone from every supplier.</p>
        <button
          onClick={purgeAll}
          disabled={loading || !stats?.count || disabled}
          className="px-4 py-2 text-sm font-semibold rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Purge all diamond data
        </button>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirm(null)}>
          <div className="bg-surface rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-xl text-ink mb-2">{confirm.title}</h2>
            <p className="text-sm text-gray-600">{confirm.body}</p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirm(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const c = confirm;
                  setConfirm(null);
                  c.run();
                }}
                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
