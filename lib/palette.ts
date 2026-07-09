// The 14-hue category color wheel (KOSHA-PLAN.md §10 — "every category
// gets a hue from a curated 14-color wheel ... color IS the navigation").
// Keys are stored on kosha_categories.color / kosha_accounts.color; the hex
// values are looked up at render time so the palette can be retuned without
// a data migration.

export type PaletteKey =
  | "rose" | "coral" | "amber" | "lime" | "emerald" | "teal" | "sky"
  | "indigo" | "violet" | "fuchsia" | "cyan" | "orange" | "pink" | "slate";

export const PALETTE: Record<PaletteKey, string> = {
  rose: "#fb7185",
  coral: "#ff8a65",
  amber: "#fbbf24",
  lime: "#a3e635",
  emerald: "#34d399",
  teal: "#2dd4bf",
  sky: "#38bdf8",
  indigo: "#818cf8",
  violet: "#a78bfa",
  fuchsia: "#e879f9",
  cyan: "#22d3ee",
  orange: "#fb923c",
  pink: "#f472b6",
  slate: "#94a3b8",
};

export const PALETTE_KEYS = Object.keys(PALETTE) as PaletteKey[];

export function paletteColor(key: string | null | undefined): string {
  return PALETTE[(key as PaletteKey) ?? "slate"] ?? PALETTE.slate;
}

/** Deterministically assign a hue by index — used when seeding defaults. */
export function paletteAt(index: number): PaletteKey {
  return PALETTE_KEYS[index % PALETTE_KEYS.length];
}
