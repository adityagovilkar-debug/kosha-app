"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { summarizeHolding } from "./holdings";
import type { Account, Holding, NetWorthSnapshot, Transaction } from "./types";

const sb = supabaseBrowser;

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Current assets/liabilities from live data. Assets = positive account
 * balances, with investment accounts revalued at their holdings' latest
 * prices (so market moves show up) instead of book cash flow.
 * Liabilities = the magnitude of negative balances (loans, credit cards
 * in the red).
 */
export function computeNetWorth(
  accounts: Account[],
  balances: Record<string, number>,
  holdings: Holding[],
  investmentTxns: Transaction[],
  latestPrices: Record<string, { price: number; date: string }>,
): { assets: number; liabilities: number; perAccount: Record<string, number> } {
  // Market value uplift per investment account: sum of its holdings'
  // (currentValue - investedNet), added on top of the account's cash
  // balance (which already reflects buys as outflows and sells as inflows).
  const marketAdjustmentByAccount: Record<string, number> = {};
  for (const holding of holdings) {
    const txns = investmentTxns.filter((t) => t.holding_id === holding.id);
    const summary = summarizeHolding(holding, txns, latestPrices[holding.id]);
    marketAdjustmentByAccount[holding.account_id] =
      (marketAdjustmentByAccount[holding.account_id] ?? 0) + (summary.currentValue - summary.investedNet);
  }

  let assets = 0;
  let liabilities = 0;
  const perAccount: Record<string, number> = {};
  for (const acc of accounts) {
    const cash = acc.opening_balance + (balances[acc.id] ?? 0);
    const value = cash + (marketAdjustmentByAccount[acc.id] ?? 0);
    perAccount[acc.id] = value;
    if (value >= 0) assets += value;
    else liabilities += -value;
  }
  return { assets, liabilities, perAccount };
}

export function useNetWorthHistory() {
  return useQuery({
    queryKey: ["kosha_net_worth_snapshots"],
    queryFn: async (): Promise<NetWorthSnapshot[]> => {
      const { data, error } = await sb().from("kosha_net_worth_snapshots").select("*").order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Writes (or refreshes) today's net-worth snapshot. Idempotent on
 * (user_id, date) — safe to call on every app load; the SnapshotWriter
 * component runs it once the underlying data is available.
 */
export async function captureSnapshot(
  userId: string,
  assets: number,
  liabilities: number,
  perAccount: Record<string, number>,
) {
  const { error } = await sb()
    .from("kosha_net_worth_snapshots")
    .upsert(
      { user_id: userId, date: today(), total_assets: assets, total_liabilities: liabilities, breakdown: perAccount },
      { onConflict: "user_id,date" },
    );
  if (error) throw error;
}

export function useInvalidateSnapshots() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["kosha_net_worth_snapshots"] });
}
