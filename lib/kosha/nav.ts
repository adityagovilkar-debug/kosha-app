"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Holding } from "./types";

const sb = supabaseBrowser;
const LAST_NAV_REFRESH_KEY = "kosha-last-nav-refresh";

export interface AmfiMatch {
  code: string;
  name: string;
  nav: number;
  date: string;
}

export async function searchAmfiSchemes(q: string): Promise<AmfiMatch[]> {
  const res = await fetch(`/api/nav?q=${encodeURIComponent(q)}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Scheme search failed");
  return body.matches ?? [];
}

/**
 * Fetches the latest NAV for every AMFI-linked holding and upserts it into
 * kosha_holding_prices under the NAV's own date (idempotent — re-running
 * on the same trading day rewrites the same row). Returns how many prices
 * were updated.
 */
export function useRefreshNavs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (holdings: Holding[]): Promise<number> => {
      const linked = holdings.filter((h) => h.amfi_code);
      if (linked.length === 0) return 0;

      const codes = Array.from(new Set(linked.map((h) => h.amfi_code!)));
      const res = await fetch(`/api/nav?codes=${codes.join(",")}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "NAV fetch failed");
      const quotes: Record<string, { nav: number; date: string }> = body.quotes ?? {};

      const rows = linked
        .map((h) => {
          const quote = quotes[h.amfi_code!];
          return quote ? { holding_id: h.id, date: quote.date, price: quote.nav } : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (rows.length === 0) return 0;

      const { error } = await sb().from("kosha_holding_prices").upsert(rows, { onConflict: "holding_id,date" });
      if (error) throw error;

      try {
        localStorage.setItem(LAST_NAV_REFRESH_KEY, new Date().toISOString().slice(0, 10));
      } catch {}
      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kosha_holding_prices"] });
      qc.invalidateQueries({ queryKey: ["kosha_net_worth_snapshots"] });
    },
  });
}

/** True if NAVs haven't been refreshed yet today (drives the once-a-day auto refresh). */
export function navRefreshDueToday(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LAST_NAV_REFRESH_KEY) !== new Date().toISOString().slice(0, 10);
}
