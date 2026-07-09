"use client";

import { getDaysInMonth } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { paletteColor } from "@/lib/palette";
import type { Budget, Category } from "@/lib/kosha/types";

interface Props {
  budget: Budget;
  category?: Category;
  spent: number; // magnitude, minor units
  prevSpent: number; // magnitude, minor units, last month
  onEdit: () => void;
  onDelete: () => void;
}

export function BudgetBar({ budget, category, spent, prevSpent, onEdit, onDelete }: Props) {
  const rolloverAmount = budget.rollover ? Math.max(0, budget.amount - prevSpent) : 0;
  const effectiveBudget = budget.amount + rolloverAmount;
  const percentSpent = effectiveBudget > 0 ? (spent / effectiveBudget) * 100 : 0;

  const now = new Date();
  const percentMonthGone = (now.getDate() / getDaysInMonth(now)) * 100;

  const status = percentSpent > 100 ? "over" : percentSpent > percentMonthGone + 10 ? "watch" : "ontrack";
  const barColor = status === "over" ? "#ff8a65" : status === "watch" ? "#fbbf24" : "#2dd4bf";

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg"
          style={{ backgroundColor: `${paletteColor(category?.color)}26` }}
        >
          {category?.emoji ?? "💸"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{category?.name ?? "Uncategorized"}</p>
          <p className="money text-xs text-text-muted">
            {formatMoney(spent)} of {formatMoney(effectiveBudget)}
            {rolloverAmount > 0 && ` (+${formatMoney(rolloverAmount)} rolled over)`}
          </p>
        </div>
        <button className="btn-ghost !min-h-0 !p-1.5" onClick={onEdit} aria-label="Edit budget">
          <Pencil className="h-4 w-4" />
        </button>
        <button className="btn-ghost !min-h-0 !p-1.5" onClick={onDelete} aria-label="Delete budget">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, percentSpent)}%`, backgroundColor: barColor }}
        />
      </div>
      <p className="mt-1.5 text-xs text-text-muted">
        {Math.round(percentSpent)}% spent · {Math.round(percentMonthGone)}% of month gone
        {status === "over" && " · over budget"}
      </p>
    </div>
  );
}
