"use client";

import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";

const sb = supabaseBrowser;

/** Distinct payees from recent history, for the quick-add autocomplete. */
export function useRecentPayees() {
  return useQuery({
    queryKey: ["kosha_payees"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await sb()
        .from("kosha_transactions")
        .select("payee")
        .not("payee", "is", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const seen = new Set<string>();
      for (const row of data ?? []) {
        if (row.payee) seen.add(row.payee);
      }
      return Array.from(seen).slice(0, 50);
    },
    staleTime: 60_000,
  });
}
