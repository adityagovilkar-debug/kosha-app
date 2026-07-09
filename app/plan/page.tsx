"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Plus, Pause, Play, Pencil, RefreshCw } from "lucide-react";
import { useBudgets, useBudgetPeriodSpend, useDeleteBudget } from "@/lib/kosha/budgets";
import { useRecurringRules, useArchiveRecurringRule } from "@/lib/kosha/recurring";
import { useCategories } from "@/lib/kosha/categories";
import { useAccounts } from "@/lib/kosha/accounts";
import { UpcomingInbox } from "@/components/UpcomingInbox";
import { BudgetBar } from "@/components/BudgetBar";
import { BudgetFormDialog } from "@/components/BudgetFormDialog";
import { RecurringRuleFormDialog } from "@/components/RecurringRuleFormDialog";
import { Modal } from "@/components/Modal";
import { formatMoney } from "@/lib/money";
import type { Budget, RecurringRule } from "@/lib/kosha/types";

export default function PlanPage() {
  const { data: budgets } = useBudgets();
  const { data: spend } = useBudgetPeriodSpend();
  const { data: allRules } = useRecurringRules(true);
  const rules = useMemo(() => (allRules ?? []).filter((r) => !r.archived), [allRules]);
  const pausedRules = useMemo(() => (allRules ?? []).filter((r) => r.archived), [allRules]);
  const { data: categories } = useCategories();
  const { data: accounts } = useAccounts();
  const deleteBudget = useDeleteBudget();
  const archiveRule = useArchiveRecurringRule();

  const categoriesById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const accountsById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);

  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<Budget | null>(null);

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);

  function openNewBudget() {
    setEditingBudget(null);
    setBudgetDialogOpen(true);
  }
  function editBudget(b: Budget) {
    setEditingBudget(b);
    setBudgetDialogOpen(true);
  }
  function openNewRule() {
    setEditingRule(null);
    setRuleDialogOpen(true);
  }
  function editRule(r: RecurringRule) {
    setEditingRule(r);
    setRuleDialogOpen(true);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Plan</h1>

      <UpcomingInbox />

      {/* Budgets */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-lg font-bold">Budgets</h2>
          <button className="btn-primary !min-h-0 !py-1.5 !px-3 text-sm" onClick={openNewBudget}>
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {(budgets?.length ?? 0) === 0 ? (
          <div className="card p-6 text-center text-text-muted">No budgets yet — set a monthly envelope for a category.</div>
        ) : (
          <div className="space-y-3">
            {(budgets ?? []).map((b) => (
              <BudgetBar
                key={b.id}
                budget={b}
                category={categoriesById.get(b.category_id)}
                spent={spend?.current[b.category_id] ?? 0}
                prevSpent={spend?.previous[b.category_id] ?? 0}
                onEdit={() => editBudget(b)}
                onDelete={() => setDeletingBudget(b)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recurring rules */}
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-lg font-bold">Subscriptions & recurring</h2>
          <button className="btn-primary !min-h-0 !py-1.5 !px-3 text-sm" onClick={openNewRule}>
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {rules.length === 0 ? (
          <div className="card p-6 text-center text-text-muted">No recurring rules yet — add subscriptions, rent, or salary.</div>
        ) : (
          <div className="card divide-y divide-[var(--border)]">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
                  <RefreshCw className="h-4 w-4 text-text-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="truncate text-xs text-text-muted">
                    {r.type === "transfer" ? `${accountsById.get(r.account_id)?.name} → ${accountsById.get(r.to_account_id ?? "")?.name}` : accountsById.get(r.account_id)?.name}
                    {" · "}every {r.interval > 1 ? `${r.interval} ` : ""}
                    {r.frequency}
                    {" · next "}
                    {format(parseISO(r.next_due), "MMM d")}
                    {r.auto_post && " · auto"}
                  </p>
                </div>
                <p className="money shrink-0 text-sm font-bold">{formatMoney(r.amount)}</p>
                <button className="btn-ghost !min-h-0 !p-1.5" onClick={() => editRule(r)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  className="btn-ghost !min-h-0 !p-1.5"
                  onClick={() => {
                    archiveRule.mutate({ id: r.id, archived: true });
                    toast.success(`${r.name} paused`);
                  }}
                  aria-label="Pause"
                >
                  <Pause className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {pausedRules.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 px-1 text-sm font-semibold text-text-muted">Paused</p>
            <div className="card divide-y divide-[var(--border)]">
              {pausedRules.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 opacity-60">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
                    <RefreshCw className="h-4 w-4 text-text-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-xs text-text-muted">
                      every {r.interval > 1 ? `${r.interval} ` : ""}
                      {r.frequency}
                    </p>
                  </div>
                  <p className="money shrink-0 text-sm font-bold">{formatMoney(r.amount)}</p>
                  <button
                    className="btn-ghost !min-h-0 !p-1.5"
                    onClick={() => {
                      archiveRule.mutate({ id: r.id, archived: false });
                      toast.success(`${r.name} resumed`);
                    }}
                    aria-label="Resume"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BudgetFormDialog open={budgetDialogOpen} onClose={() => setBudgetDialogOpen(false)} editing={editingBudget} />
      <RecurringRuleFormDialog open={ruleDialogOpen} onClose={() => setRuleDialogOpen(false)} editing={editingRule} />

      <Modal open={!!deletingBudget} onClose={() => setDeletingBudget(null)} title="Delete budget?">
        <div className="space-y-4">
          <p className="text-sm text-text-muted">This only removes the budget envelope — none of your transactions are affected.</p>
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => setDeletingBudget(null)}>
              Cancel
            </button>
            <button
              className="btn-danger flex-1"
              onClick={async () => {
                await deleteBudget.mutateAsync(deletingBudget!.id);
                toast.success("Budget deleted");
                setDeletingBudget(null);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
