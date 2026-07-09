"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { useCategories, groupCategories } from "@/lib/kosha/categories";
import { useCreateBudget, useUpdateBudget, useBudgets } from "@/lib/kosha/budgets";
import { rupeesToMinor, minorToRupees } from "@/lib/money";
import type { Budget } from "@/lib/kosha/types";

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Budget | null;
}

export function BudgetFormDialog({ open, onClose, editing }: Props) {
  const isEdit = !!editing;
  const { data: categories } = useCategories();
  const { data: budgets } = useBudgets();
  const create = useCreateBudget();
  const update = useUpdateBudget();

  const budgetedCategoryIds = new Set((budgets ?? []).filter((b) => b.id !== editing?.id).map((b) => b.category_id));
  const expenseLeafCategories = groupCategories(categories ?? [])
    .filter((g) => g.kind === "expense")
    .flatMap((g) => g.children)
    .filter((c) => !budgetedCategoryIds.has(c.id));

  const [categoryId, setCategoryId] = useState(editing?.category_id ?? "");
  const [amount, setAmount] = useState(editing ? String(minorToRupees(editing.amount)) : "");
  const [rollover, setRollover] = useState(editing?.rollover ?? false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) return toast.error("Choose a category");
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) return toast.error("Enter an amount");
    setSaving(true);
    try {
      if (isEdit) {
        await update.mutateAsync({ id: editing!.id, patch: { amount: rupeesToMinor(amountNum), rollover } });
        toast.success("Budget updated");
      } else {
        await create.mutateAsync({ category_id: categoryId, amount: rupeesToMinor(amountNum), rollover });
        toast.success("Budget created");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit budget" : "New budget"}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Category</label>
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={isEdit}>
            <option value="">Choose category…</option>
            {expenseLeafCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Monthly amount</label>
          <input className="input money" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} className="h-4 w-4" />
          Roll over unused budget into next month
        </label>
        <button className="btn-primary w-full" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create budget"}
        </button>
      </form>
    </Modal>
  );
}
