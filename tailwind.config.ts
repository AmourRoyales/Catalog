import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import colors from "tailwindcss/colors";

// ---------------------------------------------------------------------
// Light / dark theme. Every colour that has to change between themes is a
// CSS variable (an "R G B" triplet, so opacity modifiers like bg-page/50
// still work), set for :root and overridden under [data-theme="dark"] —
// see lib/theme.ts for how data-theme is chosen.
//
// - Named tokens below replace the app's hard-coded brand hexes.
// - gray / red / green / amber / blue are remapped wholesale, so the
//   existing bg-white-card + text-gray-500 + bg-red-50 classes flip
//   without a dark: variant on each. Accent blue (#3E86C6) and pure
//   white/black stay literal: they read well on both themes.
// ---------------------------------------------------------------------

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const triplet = (c: Rgb) => c.map(Math.round).join(" ");
const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => v + (b[i] - v) * t) as Rgb;

/** name -> [light hex, dark hex] */
const TOKENS: Record<string, [string, string]> = {
  page: ["#F5F8FB", "#0D131B"], // app background
  surface: ["#FFFFFF", "#161E29"], // cards, panels, modals (was bg-white)
  ink: ["#16283A", "#E6EDF5"], // headings / primary text (was text-[#16283A])
  navy: ["#16283A", "#2F4A68"], // selected chips, dark buttons (was bg-/border-[#16283A])
  "navy-hover": ["#1F3550", "#3A5A7E"],
  chrome: ["#16283A", "#0A1018"], // sidebar + public catalog headers
  subtle: ["#F4F5F7", "#1C2532"],
  "subtle-2": ["#EEF0F3", "#1F2937"],
  "subtle-3": ["#EDEEF3", "#1F2937"],
  placeholder: ["#E9ECF0", "#242E3D"], // empty image tiles
  "placeholder-2": ["#E2E5EA", "#283343"],
  "placeholder-3": ["#D9DBE6", "#2C3748"],
  tint: ["#EAF2FA", "#1A2A3D"], // light accent wash
  "tint-2": ["#DCE8F3", "#1E3249"],
  "grad-from": ["#EEF3F8", "#1C2634"],
  "grad-to": ["#E2EAF2", "#161E29"],
};

const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;

// Gray, hand-tuned to the navy surfaces: the scale inverts, so a "light
// border" (200) stays a subtle border and "muted text" (400/500) stays muted.
const DARK_GRAY: Record<(typeof SHADES)[number], string> = {
  "50": "#1B2430", "100": "#212B39", "200": "#2D3949", "300": "#3E4B5C", "400": "#788494",
  "500": "#949FAD", "600": "#B0B9C5", "700": "#C8CFD8", "800": "#DEE2E8", "900": "#ECEFF3", "950": "#F6F8FA",
};

// Status hues: 50-200 (tinted backgrounds / borders) become dark tints of
// the hue; 300+ (text, solid buttons) shift to lighter shades.
const DARK_HUE_SHADE: Record<string, string> = {
  "300": "800", "400": "400", "500": "400", "600": "500", "700": "400", "800": "300", "900": "200", "950": "100",
};
const HUES = { red: colors.red, green: colors.green, amber: colors.amber, blue: colors.blue } as const;

const light: Record<string, string> = {};
const dark: Record<string, string> = {};
const twColors: Record<string, string | Record<string, string>> = {};
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

for (const [name, [l, d]] of Object.entries(TOKENS)) {
  light[`--${name}`] = triplet(hex(l));
  dark[`--${name}`] = triplet(hex(d));
  twColors[name] = v(name);
}

twColors.gray = {};
for (const s of SHADES) {
  light[`--gray-${s}`] = triplet(hex(colors.gray[s]));
  dark[`--gray-${s}`] = triplet(hex(DARK_GRAY[s]));
  (twColors.gray as Record<string, string>)[s] = v(`gray-${s}`);
}

const darkSurface = hex(TOKENS.surface[1]);
for (const [hue, scale] of Object.entries(HUES)) {
  const shades: Record<string, string> = {};
  for (const s of SHADES) {
    light[`--${hue}-${s}`] = triplet(hex(scale[s]));
    dark[`--${hue}-${s}`] =
      s === "50" ? triplet(mix(darkSurface, hex(scale["900"]), 0.35))
      : s === "100" ? triplet(mix(darkSurface, hex(scale["900"]), 0.5))
      : s === "200" ? triplet(mix(darkSurface, hex(scale["800"]), 0.6))
      : triplet(hex(scale[DARK_HUE_SHADE[s] as keyof typeof scale]));
    shades[s] = v(`${hue}-${s}`);
  }
  twColors[hue] = shades;
}

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: twColors,
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ":root": { ...light, "color-scheme": "light" },
        ':root[data-theme="dark"]': { ...dark, "color-scheme": "dark" },
      });
    }),
  ],
};
export default config;
