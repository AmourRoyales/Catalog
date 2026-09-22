import { ACCENT } from "@/components/diamond/ui";

// ---- Shape tiles (same list/order as the VDB search) --------------------
// `values` = the stock Shape values a tile stands for; tiles with none are
// shown greyed out (VDB shape you don't stock). Rose-cut variants roll up
// into the single "Rose Cut" tile.
export const SHAPE_TILES: { label: string; icon: string; values: string[] }[] = [
  { label: "Round", icon: "circle", values: ["ROUND"] },
  { label: "Oval", icon: "oval", values: ["OVAL"] },
  { label: "Pear", icon: "pear", values: ["PEAR"] },
  { label: "Cush Mod", icon: "cushion", values: ["CUSHION"] },
  { label: "Cush Brill", icon: "cushion", values: [] },
  { label: "Emerald", icon: "emerald", values: ["EMERALD"] },
  { label: "Radiant", icon: "radiant", values: ["RADIANT"] },
  { label: "Princess", icon: "square", values: ["PRINCESS"] },
  { label: "Asscher", icon: "octagon", values: ["ASSCHER"] },
  { label: "Square", icon: "square", values: [] },
  { label: "Marquise", icon: "marquise", values: ["MARQUISE"] },
  { label: "Heart", icon: "heart", values: ["HEART"] },
  { label: "Trilliant", icon: "triangle", values: ["TRIANGLE"] },
  { label: "Euro Cut", icon: "circle", values: [] },
  { label: "Old Miner", icon: "cushion", values: [] },
  { label: "Briolette", icon: "pear", values: [] },
  {
    label: "Rose Cut", icon: "circle",
    values: ["ROSE", "ROSE ROUND", "ROSE OVAL", "ROSE PEAR", "ROSE MARQUISE", "ROSE CUSHION", "ROSE LOZENGE", "ROSE TRIANGULAR", "PENTAGON ROSE"],
  },
  { label: "Lozenge", icon: "kite", values: [] },
  { label: "Baguette", icon: "baguette", values: [] },
  { label: "Tap Bag", icon: "trapezoid", values: [] },
  { label: "Half Moon", icon: "halfmoon", values: ["HALF MOON"] },
  { label: "Flanders", icon: "pentagon", values: [] },
  { label: "Trapezoid", icon: "trapezoid", values: ["TRAPEZOID"] },
  { label: "Bullets", icon: "baguette", values: [] },
  { label: "Kite", icon: "kite", values: ["KITE"] },
  { label: "Shield", icon: "shield", values: [] },
  { label: "Star", icon: "star", values: [] },
  { label: "Pentagon", icon: "pentagon", values: [] },
  { label: "Hexagon", icon: "hexagon", values: ["HEXAGONAL"] },
  { label: "Octagonal", icon: "octagon", values: [] },
  { label: "Portuguese", icon: "circle", values: [] },
  { label: "Moval Cut", icon: "oval", values: [] },
  { label: "Lily", icon: "star", values: [] },
  { label: "Oval Step", icon: "oval", values: [] },
  { label: "Pear Step", icon: "pear", values: [] },
  { label: "Calf Head", icon: "shield", values: [] },
  // Shapes in your stock that VDB's list doesn't have a tile for.
  { label: "Ashoka", icon: "emerald", values: ["ASHOKA"] },
  { label: "Sq Emerald", icon: "emerald", values: ["SQUARE EMERALD"] },
  { label: "Sq Radiant", icon: "radiant", values: ["SQUARE RADIANT"] },
];

export const ICON_PATHS: Record<string, string> = {
  circle: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z",
  oval: "M12 2.5c4 0 6.5 4.5 6.5 9.5s-2.5 9.5-6.5 9.5S5.5 17 5.5 12 8 2.5 12 2.5z",
  pear: "M12 2c1.5 3 6 7 6 12a6 6 0 0 1-12 0c0-5 4.5-9 6-12z",
  cushion: "M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5z",
  emerald: "M8 2h8l4 4v12l-4 4H8l-4-4V6z",
  radiant: "M7 4h10l4 4v8l-4 4H7l-4-4V8z",
  square: "M4 4h16v16H4z",
  octagon: "M8 3h8l5 5v8l-5 5H8l-5-5V8z",
  marquise: "M12 2c3 3.5 5 6.5 5 10s-2 6.5-5 10c-3-3.5-5-6.5-5-10s2-6.5 5-10z",
  heart: "M12 21C5 15 3 11.5 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5C21 11.5 19 15 12 21z",
  triangle: "M12 3l9 17H3z",
  kite: "M12 2l7 8-7 12-7-12z",
  hexagon: "M12 2l8.5 5v10L12 22l-8.5-5V7z",
  pentagon: "M12 2l9.5 7-3.6 11.5H6.1L2.5 9z",
  halfmoon: "M3 15a9 9 0 0 1 18 0z",
  trapezoid: "M7 5h10l5 14H2z",
  baguette: "M8 2h8v20H8z",
  shield: "M4 3h16v9c0 5-4 8-8 10-4-2-8-5-8-10z",
  star: "M12 2l2.6 6.6 7 .5-5.4 4.5 1.7 6.9L12 16.8 6.1 20.5l1.7-6.9L2.4 9.1l7-.5z",
};

export function ShapeIcon({ kind, active, size = 26 }: { kind: string; active: boolean; size?: number }) {
  const d = ICON_PATHS[kind] ?? ICON_PATHS.circle;
  const c = active ? ACCENT : "#6B7280";
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={c} strokeWidth="1.2" strokeLinejoin="round">
      <path d={d} />
      <path d={d} transform="translate(12 12) scale(.5) translate(-12 -12)" />
    </svg>
  );
}

