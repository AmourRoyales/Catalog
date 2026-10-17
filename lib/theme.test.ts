import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_PREFS, THEME_INIT_SCRIPT, THEME_STORAGE_KEY, isDarkAt, type ThemePrefs } from "./theme";

const at = (hhmm: string) => new Date(`2026-10-18T${hhmm}:00`);

describe("isDarkAt", () => {
  it("auto window that wraps midnight (default 19:00 -> 07:00)", () => {
    expect(isDarkAt(DEFAULT_THEME_PREFS, at("18:59"))).toBe(false);
    expect(isDarkAt(DEFAULT_THEME_PREFS, at("19:00"))).toBe(true);
    expect(isDarkAt(DEFAULT_THEME_PREFS, at("02:30"))).toBe(true);
    expect(isDarkAt(DEFAULT_THEME_PREFS, at("07:00"))).toBe(false);
  });
  it("auto window within one day", () => {
    const p: ThemePrefs = { mode: "auto", darkFrom: "13:00", lightFrom: "15:00" };
    expect(isDarkAt(p, at("14:00"))).toBe(true);
    expect(isDarkAt(p, at("16:00"))).toBe(false);
  });
  it("fixed modes ignore the clock", () => {
    expect(isDarkAt({ ...DEFAULT_THEME_PREFS, mode: "dark" }, at("12:00"))).toBe(true);
    expect(isDarkAt({ ...DEFAULT_THEME_PREFS, mode: "light" }, at("23:00"))).toBe(false);
  });
});

// The <head> script duplicates isDarkAt as a string; run it against a fake
// DOM/localStorage at many times and settings and compare.
describe("THEME_INIT_SCRIPT matches isDarkAt", () => {
  const run = (stored: string | null, now: Date) => {
    const html = { dataset: {} as Record<string, string> };
    const FakeDate = function () { return now; } as unknown as DateConstructor;
    new Function("localStorage", "document", "Date", THEME_INIT_SCRIPT)(
      { getItem: (k: string) => (k === THEME_STORAGE_KEY ? stored : null) },
      { documentElement: html },
      FakeDate
    );
    return html.dataset.theme;
  };
  const cases: [string | null, ThemePrefs][] = [
    [null, DEFAULT_THEME_PREFS],
    ["not json", DEFAULT_THEME_PREFS],
    [JSON.stringify({ mode: "dark" }), { ...DEFAULT_THEME_PREFS, mode: "dark" }],
    [JSON.stringify({ mode: "light" }), { ...DEFAULT_THEME_PREFS, mode: "light" }],
    [JSON.stringify({ mode: "auto", darkFrom: "13:00", lightFrom: "15:00" }), { mode: "auto", darkFrom: "13:00", lightFrom: "15:00" }],
    [JSON.stringify({ mode: "auto", darkFrom: "99:99" }), DEFAULT_THEME_PREFS],
  ];
  it.each(cases)("stored %s", (stored, prefs) => {
    for (const t of ["00:00", "06:59", "07:00", "12:00", "13:00", "14:59", "15:00", "18:59", "19:00", "23:59"]) {
      expect(run(stored, at(t))).toBe(isDarkAt(prefs, at(t)) ? "dark" : "light");
    }
  });
});
