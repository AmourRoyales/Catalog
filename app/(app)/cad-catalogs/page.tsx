"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { METAL_LABEL, type Purity } from "@/lib/cad-pricing";

type CadCatalog = {
  id: string;
  code: string;
  name: string;
  metals: Purity[];
  category: string;
  extra_percent: number;
  show_price: boolean;
  status: string;
  created_at: string;
  item_count: number;
};

export default function CadCatalogsPage() {
  const [catalogs, setCatalogs] = useState<CadCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/cad-catalogs");
    if (res.ok) {
      setCatalogs((await res.json()).catalogs);
    }
    setLoading(false);
  }

  function shareUrl(code: string) {
    return `${window.location.origin}/catalog/${code}`;
  }

  async function copyLink(c: CadCatalog) {
    await navigator.clipboard.writeText(shareUrl(c.code));
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function toggleArchive(c: CadCatalog) {
    const newStatus = c.status === "active" ? "archived" : "active";
    await fetch(`/api/cad-catalogs/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const active = catalogs.filter((c) => c.status === "active");
  const archived = catalogs.filter((c) => c.status === "archived");

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#16283A]">CAD Catalogs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? "Loading…" : `${active.length} active · ${archived.length} archived`}
          </p>
        </div>
        <Link
          href="/cad-catalogs/new"
          className="px-5 py-2 text-sm bg-[#16283A] hover:bg-[#1f3550] text-white font-semibold rounded-lg transition"
        >
          + New CAD Catalog
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-24 text-gray-400 text-sm">Loading…</div>
      ) : catalogs.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 rounded-2xl p-16 text-center">
          <p className="text-gray-500 font-medium">No CAD catalogs yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Pick a metal, a category and a markup, then share the priced list with anyone.
          </p>
          <Link
            href="/cad-catalogs/new"
            className="inline-block mt-4 px-5 py-2 text-sm bg-[#3E86C6] text-white font-semibold rounded-lg hover:bg-[#2f6fa8] transition"
          >
            + Create your first CAD catalog
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {[...active, ...archived].map((c) => (
            <div
              key={c.id}
              className={`bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4 ${
                c.status === "archived" ? "opacity-55" : ""
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-[#F5F8FB] border border-gray-100 flex items-center justify-center text-lg shrink-0">
                ◈
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#16283A] truncate">{c.name}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 mt-0.5">
                  <span>{c.item_count} designs</span>
                  <span>{c.metals?.map((m) => METAL_LABEL[m] ?? m).join(" · ")}</span>
                  <span>{c.category}</span>
                  <span>+{c.extra_percent}% extra</span>
                  <span>Created {formatDate(c.created_at)}</span>
                  <span className={c.status === "active" ? "text-green-600" : ""}>
                    ● {c.status === "active" ? "Active" : "Archived"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.status === "active" && (
                  <>
                    <a
                      href={shareUrl(c.code)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs text-[#3E86C6] font-semibold hover:underline"
                    >
                      View ↗
                    </a>
                    <button
                      onClick={() => copyLink(c)}
                      className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
                    >
                      {copiedId === c.id ? "Copied!" : "Copy link"}
                    </button>
                  </>
                )}
                <button
                  onClick={() => toggleArchive(c)}
                  className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
                >
                  {c.status === "active" ? "Archive" : "Restore"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
