"use client";

import { useEffect, useState } from "react";

// Chart color system for Kosha's Insights (Phase 5). Built by running the
// dataviz skill's validator against Kosha's real surfaces (dark #12172b,
// light #ffffff):
//  * `categorical` is the validated 8-slot theme — assigned to chart SERIES
//    in fixed order, never cycled; a 9th series folds into "Other" (muted).
//    Worst adjacent CVD ΔE 10.3 (dark) sits in the floor band, which is
//    legal only with secondary encoding — so every chart ships a legend +
//    direct labels. Do NOT reuse the 14-hue UI category wheel here; it's
//    too lightness-uniform to be CVD-safe as adjacent series.
//  * `sequential` (blue ramp) is for continuous magnitude — the calendar
//    heatmap. Lightest = near-zero, allowed to recede toward the surface.
//  * The Aurora brand gradient stays for hero numbers / accents / Sankey
//    flows — decorative, never carrying series identity.
// Chrome/ink read from Kosha's live CSS variables so charts follow the
// app's light/dark toggle automatically.

export type ChartMode = "light" | "dark";

export const CHART_CATEGORICAL: Record<ChartMode, string[]> = {
  light: ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"],
  dark: ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767", "#d55181", "#d95926"],
};

// Blue sequential ramp (100 -> 700), light to dark.
export const CHART_SEQUENTIAL = [
  "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7",
  "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b",
];

export const AURORA_STOPS = ["#8b5cf6", "#3b82f6", "#2dd4bf"];

/** Fixed status colors — never themed, never reused as a series hue. */
export const CHART_STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

/** A colorway of N series colors: the 8 validated slots, then muted "Other". */
export function categoricalColorway(mode: ChartMode, n: number, mutedInk: string): string[] {
  const base = CHART_CATEGORICAL[mode];
  return Array.from({ length: n }, (_, i) => (i < base.length ? base[i] : mutedInk));
}

export interface ChartInk {
  text: string;
  textMuted: string;
  border: string;
  surface: string;
  income: string;
  expense: string;
}

/** Reads Kosha's live theme tokens off :root so charts match the app chrome. */
export function readChartInk(): ChartInk {
  if (typeof window === "undefined") {
    return { text: "#eef1fb", textMuted: "#9aa3c0", border: "#262d47", surface: "#12172b", income: "#2dd4bf", expense: "#ff8a65" };
  }
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    text: v("--text", "#eef1fb"),
    textMuted: v("--text-muted", "#9aa3c0"),
    border: v("--border", "#262d47"),
    surface: v("--surface", "#12172b"),
    income: v("--money-income", "#2dd4bf"),
    expense: v("--money-expense", "#ff8a65"),
  };
}

export function currentChartMode(): ChartMode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Reactive chart theme: current mode + ink tokens, re-read whenever the
 * app's light/dark class on <html> flips (via MutationObserver). Chart
 * option builders depend on this so they recompute colors on theme toggle.
 */
export function useChartTheme(): { mode: ChartMode; ink: ChartInk } {
  const [state, setState] = useState<{ mode: ChartMode; ink: ChartInk }>(() => ({
    mode: currentChartMode(),
    ink: readChartInk(),
  }));

  useEffect(() => {
    const update = () => setState({ mode: currentChartMode(), ink: readChartInk() });
    update(); // sync after mount (initial SSR value may be stale)
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return state;
}
