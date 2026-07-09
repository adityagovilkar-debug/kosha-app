"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useAccounts, useAccountBalances } from "@/lib/kosha/accounts";
import { useHoldings, useLatestPrices, useAllInvestmentTransactions } from "@/lib/kosha/holdings";
import { computeNetWorth, captureSnapshot, useInvalidateSnapshots } from "@/lib/kosha/netWorth";

function useCurrentUserId() {
  return useQuery({
    queryKey: ["kosha_current_user"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabaseBrowser().auth.getUser();
      return user?.id ?? null;
    },
  });
}

/**
 * Writes today's net-worth snapshot once per calendar day, after all the
 * underlying data has loaded (KOSHA-PLAN.md §3.6 — "written whenever the
 * user opens the app on a new day"). Renders nothing. The upsert is
 * idempotent on (user_id, date), and a ref guards against re-running
 * within the same session/day.
 */
export function SnapshotWriter() {
  const { data: userId } = useCurrentUserId();
  const { data: accounts } = useAccounts();
  const { data: balances } = useAccountBalances();
  const { data: holdings } = useHoldings();
  const { data: latestPrices } = useLatestPrices();
  const { data: investmentTxns } = useAllInvestmentTransactions();
  const invalidate = useInvalidateSnapshots();
  const doneForDay = useRef<string | null>(null);

  const ready = userId && accounts && balances && holdings && latestPrices && investmentTxns;

  useEffect(() => {
    if (!ready) return;
    const today = new Date().toISOString().slice(0, 10);
    if (doneForDay.current === today) return;
    doneForDay.current = today;

    const { assets, liabilities, perAccount } = computeNetWorth(
      accounts!,
      balances!,
      holdings!,
      investmentTxns!,
      latestPrices!,
    );
    captureSnapshot(userId!, assets, liabilities, perAccount)
      .then(() => invalidate())
      .catch(() => {
        doneForDay.current = null; // let it retry next render if it failed
      });
  }, [ready, userId, accounts, balances, holdings, latestPrices, investmentTxns, invalidate]);

  return null;
}
