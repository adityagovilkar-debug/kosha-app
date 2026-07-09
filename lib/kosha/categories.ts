"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ensureDefaultCategories } from "./seed";
import type { Category, CategoryGroup, NewCategory } from "./types";

const sb = supabaseBrowser;

async function uid(): Promise<string> {
  const {
    data: { user },
  } = await sb().auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: ["kosha_categories", { includeArchived }],
    queryFn: async (): Promise<Category[]> => {
      const id = await uid();
      await ensureDefaultCategories(sb(), id);
      let q = sb().from("kosha_categories").select("*").order("sort_order", { ascending: true });
      if (!includeArchived) q = q.eq("archived", false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Categories reshaped into group -> children for pickers and the editor. */
export function groupCategories(categories: Category[]): CategoryGroup[] {
  const groups = categories.filter((c) => !c.parent_id);
  const byParent = new Map<string, Category[]>();
  for (const c of categories) {
    if (!c.parent_id) continue;
    const list = byParent.get(c.parent_id) ?? [];
    list.push(c);
    byParent.set(c.parent_id, list);
  }
  return groups.map((g) => ({ ...g, children: byParent.get(g.id) ?? [] }));
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewCategory) => {
      const user_id = await uid();
      const { data, error } = await sb()
        .from("kosha_categories")
        .insert({ ...input, user_id })
        .select()
        .single();
      if (error) throw error;
      return data as Category;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kosha_categories"] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewCategory> }) => {
      const { error } = await sb().from("kosha_categories").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kosha_categories"] }),
  });
}

/**
 * Archive a category. If transactions still reference it, they're
 * reassigned to `reassignToId` first (or left null/uncategorized if
 * omitted) — categories are never hard-deleted while referenced.
 */
export function useArchiveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reassignToId }: { id: string; reassignToId?: string | null }) => {
      const { count, error: countError } = await sb()
        .from("kosha_transactions")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id);
      if (countError) throw countError;

      if (count && count > 0) {
        const { error: reassignError } = await sb()
          .from("kosha_transactions")
          .update({ category_id: reassignToId ?? null })
          .eq("category_id", id);
        if (reassignError) throw reassignError;
      }

      const { error } = await sb().from("kosha_categories").update({ archived: true }).eq("id", id);
      if (error) throw error;
      return count ?? 0;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kosha_categories"] });
      qc.invalidateQueries({ queryKey: ["kosha_transactions"] });
    },
  });
}
