// ---------------------------------------------------------------
// Every dropdown option on the platform lives in this one file.
// Edit here, and it changes everywhere: add form, edit form,
// products grid filters, and the catalogue builder.
// ---------------------------------------------------------------

export const CATEGORIES = [
  { value: "ring", label: "Ring" },
  { value: "mens-ring", label: "Men's Ring" },
  { value: "earring", label: "Earring" },
  { value: "pendant", label: "Pendant" },
  { value: "necklace", label: "Necklace" },
  { value: "bracelet", label: "Bracelet" },
] as const;

// ---------------------------------------------------------------
// DIAMOND SHAPE — one universal list, shared by every category.
// "Fancy", "Mix" and "No center stone" sit last on purpose:
// they are last resorts, not defaults.
// ---------------------------------------------------------------

export const DIAMOND_SHAPES: string[] = [
  "Round Brilliant",
  "Oval",
  "Princess",
  "Cushion",
  "Pear",
  "Emerald Cut",
  "Marquise",
  "Radiant",
  "Asscher",
  "Heart",
  "Trillion",
  "Baguette",
  "Hexagon",
  "Moval",
  "Fancy",
  "Mix",
  "No center stone",
];

// ---------------------------------------------------------------
// STYLES — these stay category-specific. A "Signet" earring
// means nothing, so this cascade is correct behaviour.
// ---------------------------------------------------------------

export const SUBCATEGORIES: Record<string, { label: string; options: string[] }> = {
  ring: {
    label: "Ring style",
    options: [
      "Solitaire", "Halo", "Hidden Halo", "Double Halo", "Three Stone",
      "Toi Et Moi", "Pavé", "Channel Set", "Eternity Band", "Cluster",
      "Bypass / Crossover", "Tension Set", "Bezel Set", "Statement",
    ],
  },
  "mens-ring": {
    label: "Men's ring style",
    options: [
      "Plain Band", "Signet", "Solitaire", "Cluster", "Pavé Band",
      "Eternity Band", "Bezel Set", "Channel Set", "Statement",
    ],
  },
  earring: {
    label: "Earring style",
    options: [
      "Studs", "Drops / Dangles", "Hoops", "Huggies", "Chandelier",
      "Cluster", "Toi Et Moi", "Jacket", "Threader",
    ],
  },
  pendant: {
    label: "Pendant style",
    options: [
      "Solitaire", "Halo", "Hidden Halo", "Cluster", "Three Stone",
      "Heart", "Cross / Religious", "Initial", "Bar", "Journey", "Drop",
    ],
  },
  necklace: {
    label: "Necklace style",
    options: [
      "Tennis Necklace", "Chain", "Choker",
      "Statement", "Lariat", "Bar Necklace",
    ],
  },
  bracelet: {
    label: "Bracelet style",
    options: [
      "Tennis Bracelet", "Bangle", "Charm Bracelet",
      "Chain Bracelet", "Cuff", "Link Bracelet",
    ],
  },
};

// ---------------------------------------------------------------
// Every category now points at the SAME diamond shape list.
// This is what makes the shape dropdown universal without
// touching a single other file.
// ---------------------------------------------------------------

export const STONE_SHAPES: Record<string, { label: string; options: string[] }> =
  Object.fromEntries(
    CATEGORIES.map((c) => [
      c.value,
      { label: "Diamond shape", options: DIAMOND_SHAPES },
    ])
  );