"use client";

import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { isOffline, enqueueTx } from "./offlineQueue";
import type { NewTransaction, Transaction, TransactionFilters } from "./types";

const sb = supabaseBrowser;
const PAGE_SIZE = 50;

async function uid(): Promise<string> {
  const {
    data: { user },
  } = await sb().auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

/** Paginated, filterable transaction list — newest first, grouped by day in the UI. */
export function useTransactions(filters: TransactionFilters = {}) {
  return useInfiniteQuery({
    queryKey: ["kosha_transactions", filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Transaction[]> => {
      let q = sb()
        .from("kosha_transactions")
        .select("*")
        // splits: only show parents + non-split rows in the main list; a
        // parent's children are shown inline when the row is expanded.
        .is("parent_id", null);
      if (filters.accountId) q = q.eq("account_id", filters.accountId);
      if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
      if (filters.type) q = q.eq("type", filters.type);
      if (filters.tag) q = q.contains("tags", [filters.tag]);
      if (filters.dateFrom) q = q.gte("date", filters.dateFrom);
      if (filters.dateTo) q = q.lte("date", filters.dateTo);
      if (filters.search) q = q.or(`payee.ilike.%${filters.search}%,note.ilike.%${filters.search}%`);
      q = q
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(pageParam * PAGE_SIZE, pageParam * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (lastPage, allPages) => (lastPage.length === PAGE_SIZE ? allPages.length : undefined),
  });
}

/**
 * IDs of transactions that have split children — used to render the expand
 * chevron. Returns a plain Record rather than a Set: the persisted query
 * cache round-trips through JSON (IndexedDB), and JSON.stringify(Set)
 * collapses to "{}", so a Set silently turns unusable after a reload.
 */
export function useSplitParentIds() {
  return useQuery({
    queryKey: ["kosha_transactions", "splitParentIds"],
    queryFn: async (): Promise<Record<string, true>> => {
      const { data, error } = await sb().from("kosha_transactions").select("parent_id").not("parent_id", "is", null);
      if (error) throw error;
      const ids: Record<string, true> = {};
      for (const row of data ?? []) ids[row.parent_id as string] = true;
      return ids;
    },
  });
}

export function useSplitChildren(parentId: string | null) {
  return useQuery({
    queryKey: ["kosha_transactions", "children", parentId],
    enabled: !!parentId,
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await sb().from("kosha_transactions").select("*").eq("parent_id", parentId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Recent transactions for the dashboard — small, unpaginated fetch. */
export function useRecentTransactions(limit = 8) {
  return useQuery({
    queryKey: ["kosha_transactions", "recent", limit],
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await sb()
        .from("kosha_transactions")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Cleared transactions within a date range (used for month in/out and
 * safe-to-spend). Pending rows — unconfirmed recurring occurrences or
 * receipt-scan drafts — haven't actually happened yet, so they're excluded
 * from real cash-flow totals (KOSHA-PLAN.md principle #3).
 */
export function useTransactionsInRange(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["kosha_transactions", "range", dateFrom, dateTo],
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await sb()
        .from("kosha_transactions")
        .select("*")
        .eq("status", "cleared")
        .gte("date", dateFrom)
        .lte("date", dateTo);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["kosha_transactions"] });
  qc.invalidateQueries({ queryKey: ["kosha_account_balances"] });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewTransaction): Promise<{ queued: boolean }> => {
      const user_id = await uid();
      const row = { tags: [], status: "cleared" as const, ...input, user_id };
      // Offline: queue durably and report "queued" so the UI can say so.
      // The OfflineSync component flushes it when connectivity returns.
      if (isOffline()) {
        await enqueueTx(row);
        return { queued: true };
      }
      const { error } = await sb().from("kosha_transactions").insert(row);
      if (error) throw error;
      return { queued: false };
    },
    onSuccess: () => invalidateAll(qc),
  });
}

interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  date: string;
  amount: number; // positive, minor units
  note?: string;
  tags?: string[];
}

/** Creates the two linked legs of a transfer, sharing transfer_group_id. */
export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TransferInput) => {
      const user_id = await uid();
      const transfer_group_id = crypto.randomUUID();
      const base = {
        user_id,
        date: input.date,
        type: "transfer" as const,
        note: input.note ?? null,
        tags: input.tags ?? [],
        transfer_group_id,
      };
      const { error } = await sb().from("kosha_transactions").insert([
        { ...base, account_id: input.fromAccountId, amount: -Math.abs(input.amount) },
        { ...base, account_id: input.toAccountId, amount: Math.abs(input.amount) },
      ]);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

interface SplitInput {
  account_id: string;
  date: string;
  type: NewTransaction["type"];
  payee?: string;
  note?: string;
  tags?: string[];
  splits: { category_id: string | null; amount: number; note?: string }[];
}

/** Creates a parent row for the total plus one child row per category slice. */
export function useCreateSplitTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SplitInput) => {
      const user_id = await uid();
      const total = input.splits.reduce((sum, s) => sum + s.amount, 0);
      const { data: parent, error: parentError } = await sb()
        .from("kosha_transactions")
        .insert({
          user_id,
          account_id: input.account_id,
          date: input.date,
          amount: total,
          type: input.type,
          payee: input.payee ?? null,
          note: input.note ?? null,
          tags: input.tags ?? [],
        })
        .select()
        .single();
      if (parentError) throw parentError;

      const children = input.splits.map((s) => ({
        user_id,
        account_id: input.account_id,
        date: input.date,
        amount: s.amount,
        type: input.type,
        category_id: s.category_id,
        note: s.note ?? null,
        parent_id: parent.id,
        tags: [],
      }));
      const { error: childError } = await sb().from("kosha_transactions").insert(children);
      if (childError) throw childError;
      return parent as Transaction;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewTransaction> }) => {
      const { error } = await sb().from("kosha_transactions").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** Deletes a transaction. If it's one leg of a transfer, deletes both legs. */
export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tx: Transaction) => {
      if (tx.transfer_group_id) {
        const { error } = await sb().from("kosha_transactions").delete().eq("transfer_group_id", tx.transfer_group_id);
        if (error) throw error;
        return;
      }
      // Deleting a split parent cascades to its children via the FK.
      const { error } = await sb().from("kosha_transactions").delete().eq("id", tx.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}
