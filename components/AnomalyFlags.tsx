"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, subDays } from "date-fns";
import { TrendingUp } from "lucide-react";
import { useCategories } from "@/lib/kosha/categories";
import { usePeriodTransactions, buildCategoryMaps, expenseLeaves } from "@/lib/kosha/analytics";
import { formatMoney } from "@/lib/money";

// "3× your usual dining this week" — compares the last 7 days' spend per
// category group against the average weekly spend of the preceding 8
// weeks. Only flags when there's enough history to make "usual" mean
// something (≥ 4 weeks of any spending) and the deviation is material
// (≥ 2× usual AND ≥ ₹500), so a first month of data never nags.
const LOOKBACK_DAYS = 63; // 7 current + 56 baseline
const BASELINE_WEEKS = 8;
const MIN_RATIO = 2;
const MIN_AMOUNT_MINOR = 500 * 100;
const MAX_FLAGS = 2;

export function AnomalyFlags() {
  const to = format(new Date(), "yyyy-MM-dd");
  const from = format(subDays(new Date(), LOOKBACK_DAYS - 1), "yyyy-MM-dd");
  const weekStart = format(subDays(new Date(), 6), "yyyy-MM-dd");
  const { data: txns } = usePeriodTransactions(from, to);
  const { data: categories } = useCategories();

  const flags = useMemo(() => {
    if (!txns || !categories) return [];
    const maps = buildCategoryMaps(categories);
    const leaves = expenseLeaves(txns);

    // Enough history? Oldest expense must be at least 4 weeks back.
    const oldest = leaves.reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null);
    if (!oldest || oldest > format(subDays(new Date(), 28), "yyyy-MM-dd")) return [];

    const thisWeek = new Map<string, number>();
    const baseline = new Map<string, number>();
    for (const t of leaves) {
      const group = t.category_id ? maps.groupOfCategory.get(t.category_id) : undefined;
      if (!group) continue;
      const bucket = t.date >= weekStart ? thisWeek : baseline;
      bucket.set(group.id, (bucket.get(group.id) ?? 0) + Math.abs(t.amount));
    }

    const out: { groupId: string; label: string; ratio: number; amount: number }[] = [];
    for (const [groupId, amount] of thisWeek) {
      const weeklyUsual = (baseline.get(groupId) ?? 0) / BASELINE_WEEKS;
      if (weeklyUsual <= 0) continue; // brand-new spending group — nothing "usual" yet
      const ratio = amount / weeklyUsual;
      if (ratio >= MIN_RATIO && amount >= MIN_AMOUNT_MINOR) {
        const group = maps.groups.find((g) => g.id === groupId);
        if (group) out.push({ groupId, label: `${group.emoji} ${group.name}`, ratio, amount });
      }
    }
    return out.sort((a, b) => b.ratio - a.ratio).slice(0, MAX_FLAGS);
  }, [txns, categories, weekStart]);

  if (flags.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {flags.map((f) => (
        <Link
          key={f.groupId}
          href={`/transactions?group=${f.groupId}&from=${weekStart}&to=${to}`}
          className="card flex items-center gap-3 border-amber-500/30 p-3 transition hover:bg-surface-2"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-500">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">
              {f.label} is {f.ratio >= 10 ? Math.round(f.ratio) : f.ratio.toFixed(1)}× your usual this week
            </p>
            <p className="money text-xs text-text-muted">{formatMoney(f.amount)} in the last 7 days — tap to review</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
