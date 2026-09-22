// Carat weight isn't stored as its own field — it lives in the product
// description, e.g. "Total Combined Diamond Weight: 6.27 Carats".
// Pull that number out so catalogues can sort by it.

// A number followed by a carat unit: "6.27 Carats", "1.2ct", "0.5 cttw".
const WITH_UNIT = /(\d*\.?\d+)\s*(?:carats?|cttw|ctw|cts?)\b/i;

export function parseCarat(description: string | null | undefined): number | null {
  if (!description) return null;
  const lines = description.split(/\r?\n/);

  // 1. A "total" line wins over single-stone weights
  //    ("Center Stone: 2 ct" vs "Total Diamond Weight: 3.1 ct").
  for (const line of lines) {
    if (!/total/i.test(line)) continue;
    const m = line.match(WITH_UNIT);
    if (m) return Number(m[1]);
  }

  // 2. A total diamond/stone weight line with no unit
  //    ("Total Diamond Weight: 6.27"). Read only after the colon so a
  //    number in the label itself isn't picked up.
  for (const line of lines) {
    if (!/total/i.test(line) || !/diamond|stone/i.test(line) || !/weight/i.test(line)) continue;
    const value = line.includes(":") ? line.slice(line.indexOf(":") + 1) : line;
    const m = value.match(/\d*\.?\d+/);
    if (m) return Number(m[0]);
  }

  // 3. Otherwise the first carat number anywhere.
  const m = description.match(WITH_UNIT);
  return m ? Number(m[1]) : null;
}
