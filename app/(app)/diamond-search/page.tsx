"use client";

import Link from "next/link";
import DiamondExplorer from "@/components/diamond/DiamondExplorer";
import { ACCENT } from "@/components/diamond/ui";

export default function DiamondSearchPage() {
  return (
    <DiamondExplorer
      topBar={({ total, loading }) => (
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap items-center gap-3">
          <div className="mr-2">
            <h1 className="font-serif text-lg text-[#16283A] leading-tight">Diamonds</h1>
            <p className="text-[11px] text-gray-500">Browse current stock with the same filters used for catalogs.</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-800">{loading ? "Searching…" : `${total.toLocaleString()} stones`}</span>
            <Link href="/diamond-catalogs/new" className="h-9 px-4 inline-flex items-center text-xs font-semibold text-white rounded-md" style={{ background: ACCENT }}>
              + Create catalog
            </Link>
          </div>
        </div>
      )}
    />
  );
}
