"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Catalogue = {
  id: string;
  name: string;
  share_token: string;
  show_price: boolean;
  show_description: boolean;
  status: string;
  created_at: string;
  product_count: number;
};

export default function CataloguesPage() {
  const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/catalogues");
    if (res.ok) {
      setCatalogues((await res.json()).catalogues);
    }
    setLoading(false);
  }

  function shareUrl(token: string) {
    return `${window.location.origin}/catalogue/${token}`;
  }

  async function copyLink(c: Catalogue) {
    await navigator.clipboard.writeText(shareUrl(c.share_token));
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function toggleArchive(c: Catalogue) {
    const newStatus = c.status === "active" ? "archived" : "active";
    await fetch(`/api/catalogues/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const active = catalogues.filter((c) => c.status === "active");
  const archived = catalogues.filter((c) => c.status === "archived");

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#16283A]">Catalogues</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading
              ? "Loading…"
              : `${active.length} active · ${archived.length} archived`}
          </p>
        </div>
        <Link
          href="/catalogues/new"
          className="px-5 py-2 text-sm bg-[#16283A] hover:bg-[#1f3550] text-white font-semibold rounded-lg transition"
        >
          + New Catalogue
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-24 text-gray-400 text-sm">Loading catalogues…</div>
      ) : catalogues.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 rounded-2xl p-16 text-center">
          <p className="text-gray-500 font-medium">No catalogues yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Create one, add products, and share the link with anyone.
          </p>
          <Link
            href="/catalogues/new"
            className="inline-block mt-4 px-5 py-2 text-sm bg-[#3E86C6] text-white font-semibold rounded-lg hover:bg-[#2f6fa8] transition"
          >
            + Create your first catalogue
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
                ◻
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#16283A] truncate">{c.name}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 mt-0.5">
                  <span>{c.product_count} products</span>
                  <span>Created {formatDate(c.created_at)}</span>
                  <span className={c.status === "active" ? "text-green-600" : ""}>
                    ● {c.status === "active" ? "Active" : "Archived"}
                  </span>
                  {!c.show_price && <span>Price hidden</span>}
                  {!c.show_description && <span>Description hidden</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {c.status === "active" && (
                  <>
                    <a
                      href={shareUrl(c.share_token)}
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
                    <Link
                      href={`/catalogues/${c.id}`}
                      className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
                    >
                      Edit
                    </Link>
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