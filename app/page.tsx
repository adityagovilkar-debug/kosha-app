"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, startOfMonth } from "date-fns";
import { Plus, Wallet, CalendarClock, ChevronRight } from "lucide-react";
import { useAccounts, useAccountBalances } from "@/lib/kosha/accounts";
import { useCategories } from "@/lib/kosha/categories";
import { useRecentTransactions, useTransactionsInRange, useSplitParentIds } from "@/lib/kosha/transactions";
import { usePendingRecurring } from "@/lib/kosha/recurring";
import { useNetWorthHistory, computeNetWorth } from "@/lib/kosha/netWorth";
import { useHoldings, useLatestPrices, useAllInvestmentTransactions } from "@/lib/kosha/holdings";
import { useQuickAdd } from "@/components/QuickAddProvider";
import { TransactionRow } from "@/components/TransactionRow";
import { AnimatedMoney } from "@/components/AnimatedNumber";
import { Sparkline } from "@/components/Sparkline";
import { BackupNudge } from "@/components/BackupNudge";
import { formatMoney, formatCompactINR } from "@/lib/money";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const { data: accounts } = useAccounts();
  const { data: balances } = useAccountBalances();
  const { data: categories } = useCategories();
  const { data: recent } = useRecentTransactions(8);
  const { data: splitParentIds } = useSplitParentIds();
  const { data: pendingRecurring } = usePendingRecurring();
  const { data: snapshots } = useNetWorthHistory();
  const { open: openQuickAdd } = useQuickAdd();

  const netWorthSeries = useMemo(
    () => (snapshots ?? []).slice(-30).map((s) => s.total_assets - s.total_liabilities),
    [snapshots],
  );

  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const todayStr = today();
  const { data: monthTx } = useTransactionsInRange(monthStart, todayStr);

  const { data: holdings } = useHoldings();
  const { data: latestPrices } = useLatestPrices();
  const { data: investmentTxns } = useAllInvestmentTransactions();

  const accountsById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);
  const categoriesById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);

  // Same market-adjusted calculation the Wealth tab and snapshots use, so
  // "net worth" means one thing everywhere. Falls back to cash-basis while
  // the holdings queries are still loading.
  const netWorth = useMemo(() => {
    if (!accounts || !balances) return 0;
    if (holdings && latestPrices && investmentTxns) {
      const nw = computeNetWorth(accounts, balances, holdings, investmentTxns, latestPrices);
      return nw.assets - nw.liabilities;
    }
    return accounts.reduce((sum, a) => sum + a.opening_balance + (balances[a.id] ?? 0), 0);
  }, [accounts, balances, holdings, latestPrices, investmentTxns]);

  const { income, expense } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of monthTx ?? []) {
      if (tx.type === "transfer") continue;
      // An EMI's principal leg (positive, on the loan account) is internal
      // debt movement, not income — only the bank-side outflow is cash flow.
      if (tx.type === "loan_payment" && tx.amount > 0) continue;
      if (tx.amount > 0) income += tx.amount;
      else expense += -tx.amount;
    }
    return { income, expense };
  }, [monthTx]);

  // Committed-but-not-yet-confirmed spend still due this month. This only
  // counts occurrences already materialized (due today or earlier) — a
  // rule's next occurrence later this month isn't predicted here. See
  // lib/kosha/recurring.ts.
  const upcomingCommitted = useMemo(() => {
    return (pendingRecurring ?? [])
      .filter((tx) => tx.type === "expense" && tx.date >= monthStart && tx.date <= todayStr)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  }, [pendingRecurring, monthStart, todayStr]);

  const safeToSpend = income - expense - upcomingCommitted;

  const hasAccounts = (accounts?.length ?? 0) > 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-muted">{format(new Date(), "EEEE, MMMM d")}</p>
          <h1 className="text-2xl font-bold tracking-tight">Your treasury</h1>
        </div>
        <button className="btn-primary hidden sm:inline-flex" onClick={() => openQuickAdd()}>
          <Plus className="h-5 w-5" /> Add
        </button>
      </div>

      {!hasAccounts ? (
        <div className="card p-8 text-center">
          <Wallet className="mx-auto mb-3 h-10 w-10 text-brand-400" />
          <p className="text-lg font-semibold">Let&apos;s set up your first account</p>
          <p className="mt-1 text-text-muted">Bank, cash, wallet — whatever you spend from.</p>
          <Link href="/accounts" className="btn-primary mt-4 inline-flex">
            Add an account
          </Link>
        </div>
      ) : (
        <>
          <BackupNudge />

          {/* Hero: safe to spend */}
          <div className="card rise mb-4 overflow-hidden p-6">
            <p className="text-sm font-semibold text-text-muted">Safe to spend this month</p>
            <AnimatedMoney
              value={safeToSpend}
              className={`money mt-1 block text-4xl font-bold ${safeToSpend < 0 ? "text-expense" : "brand-gradient-text"}`}
            />
            <p className="mt-1 text-xs text-text-muted">Income − spent so far − upcoming commitments</p>
          </div>

          {/* Stat tiles. Compact lakh/crore figures so large amounts never
              overflow the narrow tiles on a phone; exact values live in the
              hero, Transactions, and Wealth. */}
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="card min-w-0 p-4">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-text-muted">Net worth</p>
              <p className="money mt-1 truncate text-lg font-bold" title={formatMoney(netWorth)}>
                {formatCompactINR(netWorth)}
              </p>
              {netWorthSeries.length >= 2 && (
                <Sparkline points={netWorthSeries} className="mt-1 text-brand-400" width={80} height={20} />
              )}
            </div>
            <div className="card min-w-0 p-4">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-text-muted">In</p>
              <p className="money mt-1 truncate text-lg font-bold text-income" title={formatMoney(income)}>
                {formatCompactINR(income)}
              </p>
            </div>
            <div className="card min-w-0 p-4">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-text-muted">Out</p>
              <p className="money mt-1 truncate text-lg font-bold text-expense" title={formatMoney(expense)}>
                {formatCompactINR(expense)}
              </p>
            </div>
          </div>

          {/* Upcoming widget */}
          {(pendingRecurring?.length ?? 0) > 0 && (
            <Link
              href="/plan"
              className="card mb-6 flex items-center gap-3 p-4 transition hover:border-brand-500/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-400">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  {pendingRecurring!.length} upcoming {pendingRecurring!.length === 1 ? "charge" : "charges"} to review
                </p>
                <p className="text-xs text-text-muted">Confirm or skip in Plan</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" />
            </Link>
          )}

          {/* Recent transactions */}
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-lg font-bold">Recent</h2>
            <Link href="/transactions" className="text-sm font-semibold text-brand-400">
              View all
            </Link>
          </div>
          {(recent?.length ?? 0) === 0 ? (
            <div className="card p-6 text-center text-text-muted">Nothing logged yet — tap + to add your first transaction.</div>
          ) : (
            <div className="card divide-y divide-[var(--border)]">
              {(recent ?? []).map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  account={accountsById.get(tx.account_id)}
                  category={tx.category_id ? categoriesById.get(tx.category_id) : undefined}
                  categoriesById={categoriesById}
                  isSplitParent={splitParentIds?.[tx.id] ?? false}
                  onEdit={(t) => openQuickAdd(t)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
