"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Account, NewAccount } from "./types";

const sb = supabaseBrowser;

async function uid(): Promise<string> {
  const {
    data: { user },
  } = await sb().auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: ["kosha_accounts", { includeArchived }],
    queryFn: async (): Promise<Account[]> => {
      let q = sb().from("kosha_accounts").select("*").order("created_at", { ascending: true });
      if (!includeArchived) q = q.eq("archived", false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewAccount) => {
      const user_id = await uid();
      const { data, error } = await sb()
        .from("kosha_accounts")
        .insert({ ...input, user_id })
        .select()
        .single();
      if (error) throw error;
      return data as Account;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kosha_accounts"] }),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewAccount> }) => {
      const { error } = await sb().from("kosha_accounts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kosha_accounts"] }),
  });
}

export function useArchiveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await sb().from("kosha_accounts").update({ archived }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kosha_accounts"] }),
  });
}

/**
 * Derived balances: opening_balance + sum of each account's CLEARED
 * transactions (pending recurring occurrences / receipt drafts haven't
 * actually happened yet, so they don't move the balance — KOSHA-PLAN.md
 * principle #3). Fetches only (account_id, amount) — cheap even at a few
 * thousand rows. A cached balance column can replace this later if
 * performance demands it (KOSHA-PLAN.md §3.1).
 */
export function useAccountBalances() {
  return useQuery({
    queryKey: ["kosha_account_balances"],
    queryFn: async (): Promise<Record<string, number>> => {
      // Split children are excluded — their parent row already carries the
      // full amount, so summing both would double-count every split.
      const { data, error } = await sb()
        .from("kosha_transactions")
        .select("account_id, amount")
        .eq("status", "cleared")
        .is("parent_id", null);
      if (error) throw error;
      const sums: Record<string, number> = {};
      for (const row of data ?? []) {
        sums[row.account_id] = (sums[row.account_id] ?? 0) + row.amount;
      }
      return sums;
    },
  });
}
