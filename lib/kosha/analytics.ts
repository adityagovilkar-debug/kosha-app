"use client";

import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { groupCategories } from "./categories";
import type { Category, Transaction } from "./types";

const sb = supabaseBrowser;

/** All cleared transactions in a date range — the raw material for every Insights chart. */
export function usePeriodTransactions(from: string, to: string) {
  return useQuery({
    queryKey: ["kosha_transactions", "analytics", from, to],
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await sb()
        .from("kosha_transactions")
        .select("*")
        .eq("status", "cleared")
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** IDs of split-parent rows within a set, so their children (not the parent) count once. */
function parentIds(txns: Transaction[]): Set<string> {
  const ids = new Set<string>();
  for (const t of txns) if (t.parent_id) ids.add(t.parent_id);
  return ids;
}

/** Expense leaf rows: type expense, excluding split parents (their children carry the categorised slices). */
export function expenseLeaves(txns: Transaction[]): Transaction[] {
  const parents = parentIds(txns);
  return txns.filter((t) => t.type === "expense" && !parents.has(t.id));
}

export function incomeRows(txns: Transaction[]): Transaction[] {
  const parents = parentIds(txns);
  return txns.filter((t) => t.type === "income" && !parents.has(t.id));
}

export interface CategoryMaps {
  byId: Map<string, Category>;
  groupOfCategory: Map<string, Category>; // leaf id -> its group
  groups: Category[];
}

export function buildCategoryMaps(categories: Category[]): CategoryMaps {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const grouped = groupCategories(categories);
  const groupOfCategory = new Map<string, Category>();
  for (const g of grouped) {
    groupOfCategory.set(g.id, g); // a group maps to itself
    for (const child of g.children) groupOfCategory.set(child.id, g);
  }
  return { byId, groupOfCategory, groups: grouped };
}

/** Total expense magnitude (minor units) per category group, for the selected period. */
export function spendByGroup(txns: Transaction[], maps: CategoryMaps): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of expenseLeaves(txns)) {
    const group = t.category_id ? maps.groupOfCategory.get(t.category_id) : undefined;
    const key = group?.id ?? "uncategorized";
    out.set(key, (out.get(key) ?? 0) + Math.abs(t.amount));
  }
  return out;
}

/** Per-leaf-category spend within one group id (for sunburst children / drill). */
export function spendByCategoryInGroup(txns: Transaction[], maps: CategoryMaps): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const t of expenseLeaves(txns)) {
    const group = t.category_id ? maps.groupOfCategory.get(t.category_id) : undefined;
    const groupKey = group?.id ?? "uncategorized";
    const catKey = t.category_id ?? "uncategorized";
    if (!out.has(groupKey)) out.set(groupKey, new Map());
    const inner = out.get(groupKey)!;
    inner.set(catKey, (inner.get(catKey) ?? 0) + Math.abs(t.amount));
  }
  return out;
}

/** Expense magnitude per group per month (YYYY-MM) — for the stacked trends chart. */
export function spendByGroupByMonth(txns: Transaction[], maps: CategoryMaps): Map<string, Map<string, number>> {
  // month -> (groupId -> amount)
  const out = new Map<string, Map<string, number>>();
  for (const t of expenseLeaves(txns)) {
    const month = t.date.slice(0, 7);
    const group = t.category_id ? maps.groupOfCategory.get(t.category_id) : undefined;
    const key = group?.id ?? "uncategorized";
    if (!out.has(month)) out.set(month, new Map());
    const inner = out.get(month)!;
    inner.set(key, (inner.get(key) ?? 0) + Math.abs(t.amount));
  }
  return out;
}

/** Total expense magnitude per calendar day (YYYY-MM-DD) — calendar heatmap. */
export function dailySpend(txns: Transaction[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of expenseLeaves(txns)) {
    out.set(t.date, (out.get(t.date) ?? 0) + Math.abs(t.amount));
  }
  return out;
}

/** Income vs expense magnitude per month (YYYY-MM). */
export function cashFlowByMonth(txns: Transaction[]): Map<string, { income: number; expense: number }> {
  const out = new Map<string, { income: number; expense: number }>();
  const parents = parentIds(txns);
  for (const t of txns) {
    if (parents.has(t.id) || t.type === "transfer") continue;
    const month = t.date.slice(0, 7);
    if (!out.has(month)) out.set(month, { income: 0, expense: 0 });
    const bucket = out.get(month)!;
    if (t.type === "income") bucket.income += Math.abs(t.amount);
    else if (t.type === "expense") bucket.expense += Math.abs(t.amount);
  }
  return out;
}

export interface PayeeStat {
  payee: string;
  total: number; // minor units
  count: number;
}

/** Top payees by total expense magnitude. */
export function payeeLeaderboard(txns: Transaction[], limit = 12): PayeeStat[] {
  const map = new Map<string, PayeeStat>();
  for (const t of expenseLeaves(txns)) {
    if (!t.payee) continue;
    const s = map.get(t.payee) ?? { payee: t.payee, total: 0, count: 0 };
    s.total += Math.abs(t.amount);
    s.count += 1;
    map.set(t.payee, s);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, limit);
}

/** Foreign-currency spend grouped by trip tag, then currency. */
export interface TripSpend {
  tag: string;
  byCurrency: Map<string, { original: number; inr: number }>;
  totalInr: number;
}

export function tripSpend(txns: Transaction[]): TripSpend[] {
  const trips = new Map<string, TripSpend>();
  for (const t of expenseLeaves(txns)) {
    if (!t.original_currency || t.original_amount == null) continue;
    const inr = Math.abs(t.base_amount ?? t.amount);
    for (const tag of t.tags.length ? t.tags : ["Untagged"]) {
      if (!trips.has(tag)) trips.set(tag, { tag, byCurrency: new Map(), totalInr: 0 });
      const trip = trips.get(tag)!;
      const cur = trip.byCurrency.get(t.original_currency) ?? { original: 0, inr: 0 };
      cur.original += Math.abs(t.original_amount);
      cur.inr += inr;
      trip.byCurrency.set(t.original_currency, cur);
      trip.totalInr += inr;
    }
  }
  return Array.from(trips.values()).sort((a, b) => b.totalInr - a.totalInr);
}
