"use client";

// A hand-picked catalog's matched sets (diamond_catalogs.sets) as a table:
// one row per set — its stones, their certificates and prices — plus an
// Excel download of the same, one row per stone.
import { formatPrice } from "@/lib/format";
import type { StockRow } from "@/components/diamond/StoneDetail";

/** One saved set; a stone that is no longer on hand comes through as `row: null`. */
export type CatalogSet = { name: string; stones: { stone_id: string; row: StockRow | null }[] };

const setTotal = (s: CatalogSet) => s.stones.reduce((sum, x) => sum + (x.row ? Number(x.row.amount) : 0), 0);
const isComplete = (s: CatalogSet) => s.stones.every((x) => x.row);
const describe = (r: StockRow) => `${Number(r.carat).toFixed(2)} ct · ${r.color} ${r.clarity}`;

async function downloadExcel(sets: CatalogSet[], name: string, showPrice: boolean) {
  const XLSX = await import("xlsx");
  const header = ["Set", "Stone", "Shape", "Carat", "Color", "Clarity", "Lab", "Certificate", "Certificate link", ...(showPrice ? ["Price (USD)"] : [])];
  const rows: (string | number)[][] = [header];
  sets.forEach((s, i) => {
    for (const { stone_id, row: r } of s.stones) {
      rows.push(
        r
          ? [`${i + 1}. ${s.name}`, r.stone_id, r.shape, Number(r.carat), r.color, r.clarity, r.cert, r.report_no ?? "", r.cert_link ?? "", ...(showPrice ? [Number(r.amount)] : [])]
          : [`${i + 1}. ${s.name}`, stone_id, "No longer available"]
      );
    }
    if (showPrice) rows.push([`${i + 1}. ${s.name}`, "Set total", "", "", "", "", "", "", "", setTotal(s)]);
  });
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 7 }, { wch: 7 }, { wch: 8 }, { wch: 6 }, { wch: 14 }, { wch: 50 }, { wch: 12 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sets");
  XLSX.writeFile(book, `${name.replace(/[^\w\- ]+/g, "").trim() || "Diamond sets"}.xlsx`);
}

export default function SetsTable({ sets, name, showPrice }: { sets: CatalogSet[]; name: string; showPrice: boolean }) {
  const cell = "px-3 sm:px-4 py-3 align-top";
  const lines = "space-y-1.5 leading-5";
  return (
    <div className="max-w-[1200px] mx-auto w-full px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm text-gray-500">
          {sets.length} sets · {sets.reduce((n, s) => n + s.stones.length, 0)} stones
        </p>
        <button
          onClick={() => downloadExcel(sets, name, showPrice)}
          className="px-3.5 py-1.5 text-sm font-semibold rounded-lg bg-[#3E86C6] text-white hover:bg-[#2f6fa8] transition"
        >
          Download Excel
        </button>
      </div>

      <div className="bg-surface border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm text-ink">
          <thead className="bg-page text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className={`${cell} font-semibold`}>Set</th>
              <th className={`${cell} font-semibold`}>Stones</th>
              <th className={`${cell} font-semibold`}>Certificates</th>
              {showPrice && <th className={`${cell} font-semibold text-right`}>Price</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sets.map((s, i) => (
              <tr key={i}>
                <td className={`${cell} whitespace-nowrap`}>
                  <p className="text-xs text-gray-400">Set {i + 1}</p>
                  <p className="font-semibold">{s.name}</p>
                </td>
                <td className={cell}>
                  <div className={lines}>
                    {s.stones.map(({ stone_id, row: r }) => (
                      <p key={stone_id} className="whitespace-nowrap">
                        {r?.video_link ? (
                          <a href={r.video_link} target="_blank" rel="noopener noreferrer" className="font-medium text-[#3E86C6] hover:underline">
                            {stone_id}
                          </a>
                        ) : (
                          <span className="font-medium">{stone_id}</span>
                        )}
                        <span className="text-gray-500"> · {r ? describe(r) : "no longer available"}</span>
                      </p>
                    ))}
                  </div>
                </td>
                <td className={cell}>
                  <div className={lines}>
                    {s.stones.map(({ stone_id, row: r }) => (
                      <p key={stone_id} className="whitespace-nowrap">
                        {!r || !r.report_no ? (
                          <span className="text-gray-400">—</span>
                        ) : r.cert_link ? (
                          <a href={r.cert_link} target="_blank" rel="noopener noreferrer" className="text-[#3E86C6] hover:underline">
                            {r.cert} {r.report_no}
                          </a>
                        ) : (
                          <span>
                            {r.cert} {r.report_no}
                          </span>
                        )}
                      </p>
                    ))}
                  </div>
                </td>
                {showPrice && (
                  <td className={`${cell} text-right whitespace-nowrap`}>
                    <div className={lines}>
                      {s.stones.map(({ stone_id, row: r }) => (
                        <p key={stone_id} className="text-gray-500">{r ? formatPrice(r.amount) : "—"}</p>
                      ))}
                    </div>
                    <p className="mt-2 pt-2 border-t border-gray-100 font-semibold">
                      {formatPrice(setTotal(s))}
                      {!isComplete(s) && <span className="block text-[11px] font-normal text-gray-400">for available stones</span>}
                    </p>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
