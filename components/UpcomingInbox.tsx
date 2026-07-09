"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Check, X, TrendingUp, TrendingDown } from "lucide-react";
import { usePendingRecurring, useConfirmRecurring, useRecurringRules } from "@/lib/kosha/recurring";
import { useDeleteTransaction } from "@/lib/kosha/transactions";
import { useAccounts } from "@/lib/kosha/accounts";
import { useCategories } from "@/lib/kosha/categories";
import { rupeesToMinor, minorToRupees, formatMoney } from "@/lib/money";
import type { Transaction } from "@/lib/kosha/types";

export function UpcomingInbox() {
  const { data: pending } = usePendingRecurring();
  const { data: rules } = useRecurringRules(true);
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const confirmRecurring = useConfirmRecurring();
  const deleteTx = useDeleteTransaction();

  const rulesById = useMemo(() => new Map((rules ?? []).map((r) => [r.id, r])), [rules]);
  const accountsById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);
  const categoriesById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);

  if (!pending || pending.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="mb-2 px-1 text-lg font-bold">Upcoming</h2>
      <div className="card divide-y divide-[var(--border)]">
        {pending.map((tx) => {
          const rule = tx.recurring_rule_id ? rulesById.get(tx.recurring_rule_id) : undefined;
          if (!rule) return null;
          return (
            <UpcomingRow
              key={tx.id}
              tx={tx}
              rule={rule}
              account={accountsById.get(tx.account_id)}
              category={tx.category_id ? categoriesById.get(tx.category_id) : undefined}
              onConfirm={async (magnitudeRupees) => {
                const confirmedMagnitude = rupeesToMinor(magnitudeRupees);
                const result = await confirmRecurring.mutateAsync({ tx, confirmedMagnitude, rule });
                if (result.priceChanged) {
                  const up = result.delta > 0;
                  toast.success(`${rule.name} ${up ? "went up" : "went down"} ${formatMoney(Math.abs(result.delta))}`, {
                    icon: up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />,
                  });
                } else {
                  toast.success("Confirmed");
                }
              }}
              onSkip={() => {
                deleteTx.mutate(tx);
                toast("Skipped");
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function UpcomingRow({
  tx,
  rule,
  account,
  category,
  onConfirm,
  onSkip,
}: {
  tx: Transaction;
  rule: { name: string };
  account?: { name: string; icon: string; currency: string };
  category?: { emoji: string; name: string };
  onConfirm: (magnitudeRupees: number) => void;
  onSkip: () => void;
}) {
  const [amount, setAmount] = useState(String(minorToRupees(Math.abs(tx.amount))));
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    const value = parseFloat(amount);
    if (!value || value <= 0) return toast.error("Enter an amount");
    setConfirming(true);
    try {
      await onConfirm(value);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg">
        {tx.type === "transfer" ? "⇄" : category?.emoji ?? "💸"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{rule.name}</p>
        <p className="truncate text-xs text-text-muted">
          Due {format(parseISO(tx.date), "MMM d")} · {account?.name}
        </p>
      </div>
      <input
        className="input money w-24 !min-h-[36px] !py-1 text-right"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button className="btn-primary !min-h-[36px] !px-2.5" onClick={handleConfirm} disabled={confirming} aria-label="Confirm">
        <Check className="h-4 w-4" />
      </button>
      <button className="btn-ghost !min-h-[36px] !px-2" onClick={onSkip} aria-label="Skip">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
