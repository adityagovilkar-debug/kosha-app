"use client";

import { useMemo, useState } from "react";
import { Plus, TrendingUp } from "lucide-react";
import { useAccounts, useAccountBalances } from "@/lib/kosha/accounts";
import { useHoldings, useLatestPrices, useAllInvestmentTransactions, summarizeHolding } from "@/lib/kosha/holdings";
import { useNetWorthHistory, computeNetWorth } from "@/lib/kosha/netWorth";
import { NetWorthLineChart } from "@/components/NetWorthLineChart";
import { AllocationBars } from "@/components/AllocationBars";
import { HoldingFormDialog } from "@/components/HoldingFormDialog";
import { HoldingDetailDialog } from "@/components/HoldingDetailDialog";
import { LoanDetailDialog } from "@/components/LoanDetailDialog";
import { formatMoney, formatMoneySigned } from "@/lib/money";
import { paletteColor } from "@/lib/palette";
import type { Account, Holding } from "@/lib/kosha/types";

export default function WealthPage() {
  const { data: accounts } = useAccounts();
  const { data: balances } = useAccountBalances();
  const { data: holdings } = useHoldings();
  const { data: latestPrices } = useLatestPrices();
  const { data: investmentTxns } = useAllInvestmentTransactions();
  const { data: snapshots } = useNetWorthHistory();

  const [holdingFormOpen, setHoldingFormOpen] = useState(false);
  const [detailHolding, setDetailHolding] = useState<Holding | null>(null);
  const [detailLoan, setDetailLoan] = useState<Account | null>(null);

  const summaries = useMemo(() => {
    if (!holdings || !investmentTxns) return [];
    return holdings.map((h) =>
      summarizeHolding(h, investmentTxns.filter((t) => t.holding_id === h.id), latestPrices?.[h.id]),
    );
  }, [holdings, investmentTxns, latestPrices]);

  const allocationByClass = useMemo(() => {
    const byClass: Record<string, number> = {};
    for (const s of summaries) {
      byClass[s.holding.asset_class] = (byClass[s.holding.asset_class] ?? 0) + s.currentValue;
    }
    return byClass;
  }, [summaries]);

  const portfolioValue = summaries.reduce((sum, s) => sum + s.currentValue, 0);
  const portfolioInvested = summaries.reduce((sum, s) => sum + s.investedNet, 0);
  const portfolioReturn = summaries.reduce((sum, s) => sum + s.absoluteReturn, 0);

  const liveNetWorth = useMemo(() => {
    if (!accounts || !balances || !holdings || !investmentTxns || !latestPrices) return null;
    return computeNetWorth(accounts, balances, holdings, investmentTxns, latestPrices);
  }, [accounts, balances, holdings, investmentTxns, latestPrices]);

  const loanAccounts = (accounts ?? []).filter((a) => a.kind === "loan");

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Wealth</h1>

      {/* Net worth */}
      <div className="card mb-6 p-5">
        {liveNetWorth && (
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Net worth</p>
              <p className="money mt-1 text-lg font-bold brand-gradient-text">{formatMoney(liveNetWorth.assets - liveNetWorth.liabilities)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Assets</p>
              <p className="money mt-1 text-lg font-bold text-income">{formatMoney(liveNetWorth.assets)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Liabilities</p>
              <p className="money mt-1 text-lg font-bold text-expense">{formatMoney(liveNetWorth.liabilities)}</p>
            </div>
          </div>
        )}
        <NetWorthLineChart snapshots={snapshots ?? []} />
      </div>

      {/* Portfolio */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-lg font-bold">Portfolio</h2>
          <button className="btn-primary !min-h-0 !py-1.5 !px-3 text-sm" onClick={() => setHoldingFormOpen(true)}>
            <Plus className="h-4 w-4" /> Holding
          </button>
        </div>

        {summaries.length === 0 ? (
          <div className="card p-6 text-center text-text-muted">
            <TrendingUp className="mx-auto mb-2 h-8 w-8 text-brand-400" />
            No holdings yet — add a fund, stock, or deposit to track your investments.
          </div>
        ) : (
          <>
            <div className="card mb-3 p-4">
              <div className="mb-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-text-muted">Value</p>
                  <p className="money font-bold">{formatMoney(portfolioValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Invested</p>
                  <p className="money font-bold">{formatMoney(portfolioInvested)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Return</p>
                  <p className={`money font-bold ${portfolioReturn >= 0 ? "text-income" : "text-expense"}`}>{formatMoneySigned(portfolioReturn)}</p>
                </div>
              </div>
              <AllocationBars byClass={allocationByClass} />
            </div>

            <div className="card divide-y divide-[var(--border)]">
              {summaries.map((s) => (
                <button
                  key={s.holding.id}
                  onClick={() => setDetailHolding(s.holding)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.holding.name}</p>
                    <p className="text-xs text-text-muted">
                      {formatMoney(s.investedNet)} invested
                      {s.xirrPct != null && ` · ${(s.xirrPct * 100).toFixed(1)}% XIRR`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="money text-sm font-bold">{formatMoney(s.currentValue)}</p>
                    <p className={`money text-xs font-semibold ${s.absoluteReturn >= 0 ? "text-income" : "text-expense"}`}>
                      {formatMoneySigned(s.absoluteReturn)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Loans */}
      {loanAccounts.length > 0 && (
        <div>
          <h2 className="mb-2 px-1 text-lg font-bold">Loans</h2>
          <div className="card divide-y divide-[var(--border)]">
            {loanAccounts.map((loan) => {
              const outstanding = loan.opening_balance + (balances?.[loan.id] ?? 0);
              return (
                <button
                  key={loan.id}
                  onClick={() => setDetailLoan(loan)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg"
                    style={{ backgroundColor: `${paletteColor(loan.color)}26` }}
                  >
                    {loan.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{loan.name}</p>
                    {loan.emi_amount != null && <p className="text-xs text-text-muted">EMI {formatMoney(loan.emi_amount)}</p>}
                  </div>
                  <p className="money text-sm font-bold text-expense">{formatMoney(Math.abs(outstanding))}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <HoldingFormDialog open={holdingFormOpen} onClose={() => setHoldingFormOpen(false)} />
      <HoldingDetailDialog open={!!detailHolding} onClose={() => setDetailHolding(null)} holding={detailHolding} />
      <LoanDetailDialog open={!!detailLoan} onClose={() => setDetailLoan(null)} loan={detailLoan} />
    </div>
  );
}
