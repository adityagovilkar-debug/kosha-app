"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { xirr } from "./xirr";
import type { Holding, NewHolding, Transaction } from "./types";

const sb = supabaseBrowser;

async function uid(): Promise<string> {
  const {
    data: { user },
  } = await sb().auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

export function useHoldings(includeArchived = false) {
  return useQuery({
    queryKey: ["kosha_holdings", { includeArchived }],
    queryFn: async (): Promise<Holding[]> => {
      let q = sb().from("kosha_holdings").select("*").order("name", { ascending: true });
      if (!includeArchived) q = q.eq("archived", false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidateHoldings(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["kosha_holdings"] });
  qc.invalidateQueries({ queryKey: ["kosha_holding_prices"] });
  qc.invalidateQueries({ queryKey: ["kosha_transactions"] });
  qc.invalidateQueries({ queryKey: ["kosha_account_balances"] });
}

export function useCreateHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewHolding) => {
      const user_id = await uid();
      const { data, error } = await sb().from("kosha_holdings").insert({ units_tracked: true, ...input, user_id }).select().single();
      if (error) throw error;
      return data as Holding;
    },
    onSuccess: () => invalidateHoldings(qc),
  });
}

export function useUpdateHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewHolding> }) => {
      const { error } = await sb().from("kosha_holdings").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateHoldings(qc),
  });
}

export function useArchiveHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await sb().from("kosha_holdings").update({ archived }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateHoldings(qc),
  });
}

/** Latest known price per holding (kosha_holding_prices has no simple "latest" query via the JS builder, so this reduces client-side). */
export function useLatestPrices() {
  return useQuery({
    queryKey: ["kosha_holding_prices", "latest"],
    queryFn: async (): Promise<Record<string, { price: number; date: string }>> => {
      const { data, error } = await sb().from("kosha_holding_prices").select("*").order("date", { ascending: false });
      if (error) throw error;
      const latest: Record<string, { price: number; date: string }> = {};
      for (const row of data ?? []) {
        if (!latest[row.holding_id]) latest[row.holding_id] = { price: row.price, date: row.date };
      }
      return latest;
    },
  });
}

export function useSetHoldingPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ holdingId, date, price }: { holdingId: string; date: string; price: number }) => {
      const { error } = await sb().from("kosha_holding_prices").upsert({ holding_id: holdingId, date, price }, { onConflict: "holding_id,date" });
      if (error) throw error;
    },
    onSuccess: () => invalidateHoldings(qc),
  });
}

export function useHoldingTransactions(holdingId: string | null) {
  return useQuery({
    queryKey: ["kosha_transactions", "holding", holdingId],
    enabled: !!holdingId,
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await sb().from("kosha_transactions").select("*").eq("holding_id", holdingId!).eq("status", "cleared").order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** All cleared investment-type transactions across every holding, for the portfolio summary. */
export function useAllInvestmentTransactions() {
  return useQuery({
    queryKey: ["kosha_transactions", "allInvestments"],
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await sb()
        .from("kosha_transactions")
        .select("*")
        .not("holding_id", "is", null)
        .eq("status", "cleared")
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface HoldingSummary {
  holding: Holding;
  units: number;
  investedNet: number; // minor units, buys - sells (cash basis)
  dividends: number; // minor units
  currentValue: number; // minor units
  absoluteReturn: number; // minor units
  xirrPct: number | null;
}

/** Pure computation — no hooks — so it's testable and reusable from the Wealth page. */
export function summarizeHolding(
  holding: Holding,
  txns: Transaction[],
  latestPrice: { price: number; date: string } | undefined,
): HoldingSummary {
  let units = 0;
  let investedNet = 0;
  let dividends = 0;
  const flows: { date: string; amount: number }[] = [];

  for (const tx of txns) {
    if (tx.type === "investment_buy") {
      units += tx.qty ?? 0;
      investedNet += Math.abs(tx.amount);
      flows.push({ date: tx.date, amount: -Math.abs(tx.amount) });
    } else if (tx.type === "investment_sell") {
      units -= tx.qty ?? 0;
      investedNet -= Math.abs(tx.amount);
      flows.push({ date: tx.date, amount: Math.abs(tx.amount) });
    } else if (tx.type === "dividend") {
      dividends += Math.abs(tx.amount);
      flows.push({ date: tx.date, amount: Math.abs(tx.amount) });
    }
  }

  const currentValue = holding.units_tracked && latestPrice ? Math.round(units * latestPrice.price * 100) : investedNet;

  if (currentValue > 0) {
    flows.push({ date: new Date().toISOString().slice(0, 10), amount: currentValue });
  }

  return {
    holding,
    units,
    investedNet,
    dividends,
    currentValue,
    absoluteReturn: currentValue - investedNet + dividends,
    xirrPct: flows.length >= 2 ? xirr(flows) : null,
  };
}
