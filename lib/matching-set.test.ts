import { describe, expect, it } from "vitest";
import { groupMatchingSets } from "./matching-set";

type Item = { code: string; dataset: string; id: string };
const item = (code: string, dataset = "luxe"): Item => ({ code, dataset, id: `${dataset}:${code}` });
const keyOf = (i: Item) => ({ code: i.code, dataset: i.dataset });

describe("groupMatchingSets", () => {
  it("pairs NS/NE items with the same suffix", () => {
    const items = [item("NS-0049"), item("NE-0049")];
    const { pairs, singles } = groupMatchingSets(items, keyOf);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].setCode).toBe("0049");
    expect(pairs[0].necklace.code).toBe("NS-0049");
    expect(pairs[0].earring.code).toBe("NE-0049");
    expect(singles).toHaveLength(0);
  });

  it("preserves the variant suffix (e.g. -B) as part of the pairing key", () => {
    const items = [item("NS-0049"), item("NE-0049"), item("NS-0049-B"), item("NE-0049-B")];
    const { pairs } = groupMatchingSets(items, keyOf);
    expect(pairs).toHaveLength(2);
    expect(pairs.map((p) => p.setCode).sort()).toEqual(["0049", "0049-B"]);
  });

  it("puts an unmatched NS or NE into singles instead of dropping it", () => {
    const items = [item("NS-0011"), item("NE-0070")]; // no NE-0011, no NS-0070
    const { pairs, singles } = groupMatchingSets(items, keyOf);
    expect(pairs).toHaveLength(0);
    expect(singles.map((s) => s.code).sort()).toEqual(["NE-0070", "NS-0011"]);
  });

  it("never pairs items from a non-luxe dataset, even with matching codes", () => {
    const items = [item("NS-0049", "luxe"), item("NE-0049", "design")];
    const { pairs, singles } = groupMatchingSets(items, keyOf);
    expect(pairs).toHaveLength(0);
    expect(singles).toHaveLength(2);
  });

  it("leaves non-NS/NE codes (rings, earrings from other collections, ...) as singles", () => {
    const items = [item("LR-0001"), item("LE-0001"), item("NS-0049"), item("NE-0049")];
    const { pairs, singles } = groupMatchingSets(items, keyOf);
    expect(pairs).toHaveLength(1);
    expect(singles.map((s) => s.code).sort()).toEqual(["LE-0001", "LR-0001"]);
  });

  it("sorts pairs numerically by set code", () => {
    const items = [item("NS-0100"), item("NE-0100"), item("NS-0002"), item("NE-0002"), item("NS-0011"), item("NE-0011")];
    const { pairs } = groupMatchingSets(items, keyOf);
    expect(pairs.map((p) => p.setCode)).toEqual(["0002", "0011", "0100"]);
  });

  it("returns no pairs and all singles for an empty or fully-unmatched input", () => {
    expect(groupMatchingSets([], keyOf)).toEqual({ pairs: [], singles: [] });
    const items = [item("LR-0001"), item("LE-0002")];
    const { pairs, singles } = groupMatchingSets(items, keyOf);
    expect(pairs).toHaveLength(0);
    expect(singles).toHaveLength(2);
  });
});
