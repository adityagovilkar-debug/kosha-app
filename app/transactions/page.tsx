"use client";

import { useMemo, useState } from "react";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import { useAccounts } from "@/lib/kosha/accounts";
import { useCategories } from "@/lib/kosha/categories";
import { useTransactions, useDeleteTransaction, useSplitParentIds } from "@/lib/kosha/transactions";
import { useQuickAdd } from "@/components/QuickAddProvider";
import { TransactionFiltersBar } from "@/components/TransactionFilters";
import { TransactionRow } from "@/components/TransactionRow";
import { Modal } from "@/components/Modal";
import { formatMoneySigned } from "@/lib/money";
import type { Transaction, TransactionFilters } from "@/lib/kosha/types";
import { errMessage } from "@/lib/errors";

function dayLabel(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
}

export default function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>({});
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useTransactions(filters);
  const { data: splitParentIds } = useSplitParentIds();
  const deleteTx = useDeleteTransaction();
  const { open: openQuickAdd } = useQuickAdd();
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);

  const accountsById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);
  const categoriesById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);

  const transactions = useMemo(() => data?.pages.flat() ?? [], [data]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      const list = map.get(tx.date) ?? [];
      list.push(tx);
      map.set(tx.date, list);
    }
    return Array.from(map.entries()); // already ordered by the query (date desc)
  }, [transactions]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteTx.mutateAsync(pendingDelete);
      toast.success("Deleted");
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Transactions</h1>

      <TransactionFiltersBar filters={filters} onChange={setFilters} accounts={accounts ?? []} categories={categories ?? []} />

      {isLoading && <p className="text-text-muted">Loading…</p>}

      {!isLoading && transactions.length === 0 && (
        <div className="card p-8 text-center text-text-muted">
          <p className="text-lg font-semibold text-text">No transactions found</p>
          <p className="mt-1">Tap the + button to log your first one.</p>
        </div>
      )}

      <div className="space-y-5">
        {groups.map(([date, txs]) => {
          // Transfers and the loan-side EMI leg (positive loan_payment) are
          // internal movements, not cash flow for the day.
          const dayTotal = txs
            .filter((t) => t.type !== "transfer" && !(t.type === "loan_payment" && t.amount > 0))
            .reduce((sum, t) => sum + t.amount, 0);
          return (
            <div key={date}>
              <div className="mb-1 flex items-baseline justify-between px-2">
                <p className="text-sm font-semibold text-text-muted">{dayLabel(date)}</p>
                <p className={`money text-sm font-semibold ${dayTotal < 0 ? "text-expense" : dayTotal > 0 ? "text-income" : "text-text-muted"}`}>
                  {formatMoneySigned(dayTotal)}
                </p>
              </div>
              <div className="card divide-y divide-[var(--border)]">
                {txs.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    account={accountsById.get(tx.account_id)}
                    category={tx.category_id ? categoriesById.get(tx.category_id) : undefined}
                    categoriesById={categoriesById}
                    isSplitParent={splitParentIds?.[tx.id] ?? false}
                    onEdit={(t) => openQuickAdd(t)}
                    onDelete={(t) => setPendingDelete(t)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {hasNextPage && (
        <button className="btn-outline mt-6 w-full" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}

      <Modal open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Delete transaction?">
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            {pendingDelete?.transfer_group_id
              ? "This deletes both sides of the transfer."
              : "This can't be undone."}
          </p>
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => setPendingDelete(null)}>
              Cancel
            </button>
            <button className="btn-danger flex-1" onClick={confirmDelete}>
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
