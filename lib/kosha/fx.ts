"use client";

import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";

const sb = supabaseBrowser;

export const COMMON_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "JPY", "AUD", "CAD", "CHF"];

/**
 * INR-per-1-unit rate for `currency` on `date`. Checks the shared cache
 * first (falling back to the nearest earlier cached date — KOSHA-PLAN.md
 * §3.8), then fetches from Frankfurter and caches the result for next
 * time. Frankfurter itself already returns the nearest earlier trading
 * day's rate for weekends/holidays, so the cache is keyed on whatever
 * date it actually reports.
 */
export async function fetchFxRate(date: string, currency: string): Promise<number> {
  const code = currency.trim().toUpperCase();
  if (code === "INR") return 1;

  const { data: cached, error: cacheError } = await sb()
    .from("kosha_fx_rates")
    .select("rate_to_inr")
    .eq("currency", code)
    .lte("date", date)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cacheError) throw cacheError;
  if (cached) return cached.rate_to_inr;

  const res = await fetch(`https://api.frankfurter.app/${date}?from=${code}&to=INR`);
  if (!res.ok) throw new Error(`Couldn't fetch the ${code} exchange rate`);
  const json: { date: string; rates: Record<string, number> } = await res.json();
  const rate = json.rates?.INR;
  if (!rate) throw new Error(`No INR rate available for ${code}`);

  // Best-effort cache write — a concurrent request may have already
  // inserted the same (date, currency) row, which is fine to ignore.
  await sb().from("kosha_fx_rates").upsert({ date: json.date, currency: code, rate_to_inr: rate }, { onConflict: "date,currency", ignoreDuplicates: true });

  return rate;
}

export function useFxRate(date: string, currency: string, enabled: boolean) {
  return useQuery({
    queryKey: ["kosha_fx_rate", date, currency],
    queryFn: () => fetchFxRate(date, currency),
    enabled: enabled && !!date && !!currency,
    staleTime: Infinity, // exchange rates for a past date never change
  });
}
