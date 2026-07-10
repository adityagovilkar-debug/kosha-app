"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Goal, NewGoal } from "./types";

const sb = supabaseBrowser;

async function uid(): Promise<string> {
  const {
    data: { session },
  } = await sb().auth.getSession();
  if (!session?.user) throw new Error("Not signed in");
  return session.user.id;
}

export function useGoals(includeArchived = false) {
  return useQuery({
    queryKey: ["kosha_goals", { includeArchived }],
    queryFn: async (): Promise<Goal[]> => {
      let q = sb().from("kosha_goals").select("*").order("created_at", { ascending: true });
      if (!includeArchived) q = q.eq("archived", false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidateGoals(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["kosha_goals"] });
  qc.invalidateQueries({ queryKey: ["kosha_goal_tag_progress"] });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewGoal) => {
      const user_id = await uid();
      const { error } = await sb().from("kosha_goals").insert({ emoji: "🎯", ...input, user_id });
      if (error) throw error;
    },
    onSuccess: () => invalidateGoals(qc),
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewGoal> }) => {
      const { error } = await sb().from("kosha_goals").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateGoals(qc),
  });
}

export function useArchiveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await sb().from("kosha_goals").update({ archived }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateGoals(qc),
  });
}

/**
 * Saved-so-far per tag, for every tag-sourced goal in one query: the sum of
 * POSITIVE cleared amounts carrying the tag — i.e. deposits (income or the
 * incoming transfer leg) tagged with the goal's tag. Split children are
 * excluded (their parent carries the tags).
 */
export function useGoalTagProgress(tags: string[]) {
  return useQuery({
    queryKey: ["kosha_goal_tag_progress", [...tags].sort()],
    enabled: tags.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await sb()
        .from("kosha_transactions")
        .select("amount, tags")
        .eq("status", "cleared")
        .is("parent_id", null)
        .gt("amount", 0)
        .overlaps("tags", tags);
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const tag of tags) out[tag] = 0;
      for (const row of data ?? []) {
        for (const tag of (row.tags as string[]) ?? []) {
          if (tag in out) out[tag] += row.amount;
        }
      }
      return out;
    },
  });
}
