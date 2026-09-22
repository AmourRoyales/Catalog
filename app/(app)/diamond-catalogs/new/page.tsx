"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DiamondExplorer from "@/components/diamond/DiamondExplorer";
import { Check, ACCENT } from "@/components/diamond/ui";

export default function NewDiamondCatalogPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [showPrice, setShowPrice] = useState(true);
  const [showBranding, setShowBranding] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  return (
    <DiamondExplorer
      topBar={({ filters, total, loading, dirty, resetAll }) => {
        async function handleSave() {
          setError("");
          if (!name.trim()) return setError("Catalog name is required.");
          if (dirty) return setError("You have filter changes that aren't applied — hit Apply Filters first, so the catalog matches the results shown.");
          if (total === 0) return setError("This filter matches no stones — adjust it before saving.");
          setSaving(true);
          try {
            const res = await fetch("/api/diamond-catalogs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: name.trim(), filters, show_price: showPrice, show_branding: showBranding }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save the catalog.");
            router.push("/diamond-catalogs");
            router.refresh();
          } catch (err: any) {
            setError(err.message || "Something went wrong.");
            setSaving(false);
          }
        }

        return (
          <>
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap items-center gap-3">
              <div className="mr-2">
                <h1 className="font-serif text-lg text-[#16283A] leading-tight">New Diamond Catalog</h1>
                <p className="text-[11px] text-gray-500">Saved filters stay live against current stock.</p>
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Catalog name *"
                className="h-9 w-64 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-gray-500"
              />
              <Check checked={showPrice} onChange={setShowPrice} label="Show price" />
              <Check checked={showBranding} onChange={setShowBranding} label="JeniDiam branding" />
              <div className="ml-auto flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-800">{loading ? "Searching…" : `${total.toLocaleString()} stones`}</span>
                <button
                  onClick={resetAll}
                  title="Clears every filter, so this catalog publishes your entire current stock"
                  className="h-9 px-4 text-xs font-semibold border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Use All Diamonds
                </button>
                <button onClick={() => router.push("/diamond-catalogs")} className="h-9 px-4 text-xs border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="h-9 px-5 text-xs font-semibold text-white rounded-md disabled:opacity-60"
                  style={{ background: ACCENT }}
                >
                  {saving ? "Saving…" : "Save & Publish"}
                </button>
              </div>
            </div>
            {error && (
              <div className="mx-6 mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
            )}
          </>
        );
      }}
    />
  );
}
