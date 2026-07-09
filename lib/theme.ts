"use client";

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

// Inlined into <head> as a string so it runs before paint.
export const PREPAINT_SCRIPT = `(function(){try{
  var t=localStorage.getItem('${THEME_KEY}');
  var d=t?t==='dark':true;
  if(d)document.documentElement.classList.add('dark');
}catch(e){document.documentElement.classList.add('dark');}})();`;
