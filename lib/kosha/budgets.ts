"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Budget, NewBudget } from "./types";

const sb = supabaseBrowser;

async function uid(): Promise<string> {
  const {
    data: { user },
  } = await sb().auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

export function useBudgets() {
  return useQuery({
    queryKey: ["kosha_budgets"],
    queryFn: async (): Promise<Budget[]> => {
      const { data, error } = await sb().from("kosha_budgets").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidateBudgets(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["kosha_budgets"] });
}

export function useCreateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewBudget) => {
      const user_id = await uid();
      const { error } = await sb().from("kosha_budgets").insert({ rollover: false, ...input, user_id });
      if (error) throw error;
    },
    onSuccess: () => invalidateBudgets(qc),
  });
}

export function useUpdateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewBudget> }) => {
      const { error } = await sb().from("kosha_budgets").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateBudgets(qc),
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb().from("kosha_budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateBudgets(qc),
  });
}

/**
 * Cleared expense spend per category for this month and last month (the
 * latter feeds the rollover calculation — unspent envelope carries
 * forward). One query covering both months, split client-side.
 */
export function useBudgetPeriodSpend() {
  const now = new Date();
  const currentStart = format(startOfMonth(now), "yyyy-MM-dd");
  const currentEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const previousStart = format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
  const previousEnd = format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["kosha_budget_spend", currentStart],
    queryFn: async (): Promise<{ current: Record<string, number>; previous: Record<string, number> }> => {
      const { data, error } = await sb()
        .from("kosha_transactions")
        .select("category_id, amount, date")
        .eq("status", "cleared")
        .eq("type", "expense")
        .not("category_id", "is", null)
        .gte("date", previousStart)
        .lte("date", currentEnd);
      if (error) throw error;

      const current: Record<string, number> = {};
      const previous: Record<string, number> = {};
      for (const row of data ?? []) {
        const bucket = row.date >= currentStart ? current : row.date <= previousEnd ? previous : null;
        if (!bucket || !row.category_id) continue;
        bucket[row.category_id] = (bucket[row.category_id] ?? 0) + Math.abs(row.amount);
      }
      return { current, previous };
    },
  });
}
