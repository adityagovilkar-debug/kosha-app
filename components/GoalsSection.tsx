"use client";

import { useMemo, useState } from "react";
import { differenceInCalendarDays, parseISO, format } from "date-fns";
import { toast } from "sonner";
import { Plus, Target, Pencil, Archive } from "lucide-react";
import { useGoals, useGoalTagProgress, useArchiveGoal } from "@/lib/kosha/goals";
import { useAccounts, useAccountBalances } from "@/lib/kosha/accounts";
import { GoalFormDialog } from "./GoalFormDialog";
import { formatMoney } from "@/lib/money";
import type { Goal } from "@/lib/kosha/types";

// Savings goals on the Wealth page. Progress is derived live: an
// account-sourced goal reads that account's balance; a tag-sourced goal
// sums deposits carrying the tag.
export function GoalsSection() {
  const { data: goals } = useGoals();
  const { data: accounts } = useAccounts();
  const { data: balances } = useAccountBalances();
  const archiveGoal = useArchiveGoal();

  const tagList = useMemo(() => (goals ?? []).filter((g) => g.source === "tag" && g.tag).map((g) => g.tag!), [goals]);
  const { data: tagProgress } = useGoalTagProgress(tagList);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  const accountsById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);

  function progressOf(goal: Goal): number {
    if (goal.source === "account" && goal.account_id) {
      const acc = accountsById.get(goal.account_id);
      if (!acc) return 0;
      return Math.max(0, acc.opening_balance + (balances?.[acc.id] ?? 0));
    }
    if (goal.source === "tag" && goal.tag) return tagProgress?.[goal.tag] ?? 0;
    return 0;
  }

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-lg font-bold">Goals</h2>
        <button
          className="btn-primary !min-h-0 !py-1.5 !px-3 text-sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Goal
        </button>
      </div>

      {(goals?.length ?? 0) === 0 ? (
        <div className="card p-6 text-center text-text-muted">
          <Target className="mx-auto mb-2 h-8 w-8 text-brand-400" />
          Set a savings goal — a trip, an emergency fund, a big purchase.
        </div>
      ) : (
        <div className="space-y-3">
          {(goals ?? []).map((goal) => {
            const saved = progressOf(goal);
            const pct = Math.min(100, (saved / goal.target_amount) * 100);
            const done = saved >= goal.target_amount;
            const daysLeft = goal.target_date ? differenceInCalendarDays(parseISO(goal.target_date), new Date()) : null;
            return (
              <div key={goal.id} className="card p-4">
                <div className="mb-2 flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-xl">
                    {goal.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{goal.name}</p>
                    <p className="money truncate text-xs text-text-muted">
                      {formatMoney(saved)} of {formatMoney(goal.target_amount)}
                      {goal.target_date &&
                        (daysLeft != null && daysLeft >= 0
                          ? ` · ${daysLeft} days left`
                          : ` · was due ${format(parseISO(goal.target_date), "MMM d")}`)}
                    </p>
                  </div>
                  <button
                    className="btn-ghost !min-h-0 shrink-0 !p-1.5"
                    onClick={() => {
                      setEditing(goal);
                      setDialogOpen(true);
                    }}
                    aria-label="Edit goal"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    className="btn-ghost !min-h-0 shrink-0 !p-1.5"
                    onClick={() => {
                      archiveGoal.mutate({ id: goal.id, archived: true });
                      toast.success(`${goal.name} archived`);
                    }}
                    aria-label="Archive goal"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full transition-all ${done ? "" : "brand-gradient"}`}
                    style={{ width: `${pct}%`, backgroundColor: done ? "var(--money-income)" : undefined }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-text-muted">
                  {done ? "🎉 Goal reached!" : `${Math.round(pct)}% there`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <GoalFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} />
    </div>
  );
}
