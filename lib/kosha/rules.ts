"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { CategoryRule, NewCategoryRule } from "./types";

const sb = supabaseBrowser;

async function uid(): Promise<string> {
  const {
    data: { session },
  } = await sb().auth.getSession();
  if (!session?.user) throw new Error("Not signed in");
  return session.user.id;
}

export function useCategoryRules() {
  return useQuery({
    queryKey: ["kosha_category_rules"],
    queryFn: async (): Promise<CategoryRule[]> => {
      const { data, error } = await sb().from("kosha_category_rules").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCategoryRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewCategoryRule) => {
      const user_id = await uid();
      const { error } = await sb().from("kosha_category_rules").insert({ ...input, pattern: input.pattern.trim(), user_id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kosha_category_rules"] }),
  });
}

export function useDeleteCategoryRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb().from("kosha_category_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kosha_category_rules"] }),
  });
}

/**
 * First matching rule's category for a payee, or null. Case-insensitive
 * substring match; the LONGEST pattern wins so "swiggy instamart" beats
 * "swiggy" — specificity without needing a priority column.
 */
export function matchRule(rules: CategoryRule[], payee: string): string | null {
  const hay = payee.trim().toLowerCase();
  if (!hay) return null;
  let best: CategoryRule | null = null;
  for (const rule of rules) {
    const needle = rule.pattern.toLowerCase();
    if (!needle || !hay.includes(needle)) continue;
    if (!best || needle.length > best.pattern.length) best = rule;
  }
  return best?.category_id ?? null;
}
