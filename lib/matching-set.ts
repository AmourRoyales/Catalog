// Pure, dependency-free pairing logic for Luxe "Necklace Set" matching sets
// (NS-<code> necklace + NE-<code> earring, same suffix). No data imports
// here on purpose — unlike lib/cad-designs.ts (which pulls in the ~12MB
// design JSON and must never reach the client), this is safe to import from
// "use client" components too, e.g. the public catalog viewer.
const SET_PREFIX_RE = /^(NS|NE)\s*-?\s*/i;

export type MatchingSetGroup<T> = { setCode: string; necklace: T; earring: T };

/**
 * Groups items into NS/NE matching-set pairs (by design code suffix) plus
 * everything left over. `keyOf` extracts the code and dataset from
 * whatever item shape the caller has (a full CadDesign, a stored catalog
 * item, ...). Only "luxe" items are eligible — the NS/NE convention only
 * holds in that library's "Necklace Set" collection — anything else always
 * goes to `singles`.
 */
export function groupMatchingSets<T>(
  items: T[],
  keyOf: (item: T) => { code: string; dataset: string }
): { pairs: MatchingSetGroup<T>[]; singles: T[] } {
  const necklaces = new Map<string, T>();
  const earrings = new Map<string, T>();
  const singles: T[] = [];

  for (const item of items) {
    const { code, dataset } = keyOf(item);
    if (dataset !== "luxe") {
      singles.push(item);
      continue;
    }
    const m = code.match(SET_PREFIX_RE);
    if (!m) {
      singles.push(item);
      continue;
    }
    const suffix = code.slice(m[0].length).trim();
    (m[1].toUpperCase() === "NS" ? necklaces : earrings).set(suffix, item);
  }

  const pairs: MatchingSetGroup<T>[] = [];
  const pairedNecklaceSuffixes = new Set<string>();
  earrings.forEach((earring, suffix) => {
    const necklace = necklaces.get(suffix);
    if (necklace) {
      pairs.push({ setCode: suffix, necklace, earring });
      pairedNecklaceSuffixes.add(suffix);
    } else {
      singles.push(earring);
    }
  });
  necklaces.forEach((necklace, suffix) => {
    if (!pairedNecklaceSuffixes.has(suffix)) singles.push(necklace);
  });

  pairs.sort((a, b) => a.setCode.localeCompare(b.setCode, undefined, { numeric: true }));
  return { pairs, singles };
}
