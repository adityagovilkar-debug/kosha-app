"use client";

import { useEffect, useState } from "react";

// Theme (light/dark) is stored locally on the device and applied to <html>.
// A pre-paint script in app/layout.tsx applies the saved value before first
// render to avoid a flash. Dark is the default — it's the "Aurora Ledger"
// hero look (see KOSHA-PLAN.md §10).

export type Theme = "light" | "dark";

export const THEME_KEY = "kosha-theme";

export function getTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}

/** Reactive theme read + setter, kept in sync with the <html> class. */
export function useTheme(): [Theme, (t: Theme) => void] {
  // Lazy-init from the live class — the prepaint script sets it before
  // hydration, so this is correct without a sync setState in the effect.
  const [theme, setThemeState] = useState<Theme>(getTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeState(getTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return [theme, setTheme];
}

// Inlined into <head> as a string so it runs before paint.
export const PREPAINT_SCRIPT = `(function(){try{
  var t=localStorage.getItem('${THEME_KEY}');
  var d=t?t==='dark':true;
  if(d)document.documentElement.classList.add('dark');
}catch(e){document.documentElement.classList.add('dark');}})();`;
