"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addWeeks, addMonths, addYears, isAfter, parseISO, format } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Frequency, NewRecurringRule, RecurringRule, Transaction } from "./types";

const sb = supabaseBrowser;

async function uid(): Promise<string> {
  const {
    data: { user },
  } = await sb().auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Advance a date by one occurrence. The date's own day-of-month/weekday IS the schedule anchor. */
function stepDate(date: Date, frequency: Frequency, interval: number): Date {
  switch (frequency) {
    case "daily":
      return addDays(date, interval);
    case "weekly":
      return addWeeks(date, interval);
    case "monthly":
      return addMonths(date, interval);
    case "quarterly":
      return addMonths(date, interval * 3);
    case "yearly":
      return addYears(date, interval);
    default:
      throw new Error(`Unknown frequency: ${frequency}`);
  }
}

export function useRecurringRules(includeArchived = false) {
  return useQuery({
    queryKey: ["kosha_recurring_rules", { includeArchived }],
    queryFn: async (): Promise<RecurringRule[]> => {
      let q = sb().from("kosha_recurring_rules").select("*").order("name", { ascending: true });
      if (!includeArchived) q = q.eq("archived", false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidateRecurring(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["kosha_recurring_rules"] });
  qc.invalidateQueries({ queryKey: ["kosha_transactions"] });
  qc.invalidateQueries({ queryKey: ["kosha_account_balances"] });
}

export function useCreateRecurringRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewRecurringRule) => {
      const user_id = await uid();
      // Callers pass next_due = start_date — the very first occurrence.
      const { data, error } = await sb()
        .from("kosha_recurring_rules")
        .insert({ amount_mode: "fixed", auto_post: false, ...input, user_id })
        .select()
        .single();
      if (error) throw error;
      return data as RecurringRule;
    },
    onSuccess: () => invalidateRecurring(qc),
  });
}

export function useUpdateRecurringRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewRecurringRule> }) => {
      const { error } = await sb().from("kosha_recurring_rules").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateRecurring(qc),
  });
}

export function useArchiveRecurringRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await sb().from("kosha_recurring_rules").update({ archived }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateRecurring(qc),
  });
}

/**
 * Idempotent materialization: for every active rule due on or before today,
 * insert one transaction per un-materialized occurrence (checked against
 * existing (recurring_rule_id, date) pairs, not just next_due), then
 * advance next_due past today. Safe to call repeatedly / from multiple tabs.
 */
async function materializeDueRules(userId: string) {
  const todayStr = today();
  const todayDate = parseISO(todayStr);

  const { data: dueRules, error: rulesError } = await sb()
    .from("kosha_recurring_rules")
    .select("*")
    .eq("user_id", userId)
    .eq("archived", false)
    .lte("next_due", todayStr);
  if (rulesError) throw rulesError;
  if (!dueRules || dueRules.length === 0) return;

  const ruleIds = dueRules.map((r) => r.id);
  const { data: existing, error: existingError } = await sb()
    .from("kosha_transactions")
    .select("recurring_rule_id, date")
    .in("recurring_rule_id", ruleIds);
  if (existingError) throw existingError;
  const materialized = new Set((existing ?? []).map((r) => `${r.recurring_rule_id}|${r.date}`));

  const newRows: Record<string, unknown>[] = [];
  const ruleUpdates: { id: string; next_due: string; archived?: boolean }[] = [];

  for (const rule of dueRules as RecurringRule[]) {
    const endDate = rule.end_date ? parseISO(rule.end_date) : null;
    let due = parseISO(rule.next_due);
    const dueDates: string[] = [];
    while (!isAfter(due, todayDate) && (!endDate || !isAfter(due, endDate))) {
      dueDates.push(format(due, "yyyy-MM-dd"));
      due = stepDate(due, rule.frequency, rule.interval);
    }

    for (const dueDate of dueDates) {
      if (materialized.has(`${rule.id}|${dueDate}`)) continue;
      const status = rule.auto_post ? "cleared" : "pending";
      if (rule.type === "transfer" && rule.to_account_id) {
        const transfer_group_id = crypto.randomUUID();
        const base = {
          user_id: userId,
          date: dueDate,
          type: "transfer" as const,
          status,
          recurring_rule_id: rule.id,
          note: rule.note,
          tags: [],
          transfer_group_id,
        };
        newRows.push({ ...base, account_id: rule.account_id, amount: -rule.amount });
        newRows.push({ ...base, account_id: rule.to_account_id, amount: rule.amount });
      } else if (rule.type !== "transfer") {
        const magnitude = rule.amount_mode === "variable" ? (rule.last_confirmed_amount ?? rule.amount) : rule.amount;
        // Cash out for expenses and SIP buys; cash in for income.
        const cashOut = rule.type === "expense" || rule.type === "investment_buy";
        newRows.push({
          user_id: userId,
          account_id: rule.account_id,
          date: dueDate,
          amount: cashOut ? -magnitude : magnitude,
          type: rule.type,
          category_id: rule.category_id,
          holding_id: rule.holding_id,
          payee: rule.payee,
          note: rule.note,
          status,
          recurring_rule_id: rule.id,
          tags: [],
        });
      }
    }

    const newNextDue = format(due, "yyyy-MM-dd");
    const exhausted = !!endDate && isAfter(due, endDate);
    if (newNextDue !== rule.next_due || exhausted) {
      ruleUpdates.push({ id: rule.id, next_due: newNextDue, ...(exhausted ? { archived: true } : {}) });
    }
  }

  if (newRows.length > 0) {
    const { error: insertError } = await sb().from("kosha_transactions").insert(newRows);
    if (insertError) throw insertError;
  }
  await Promise.all(
    ruleUpdates.map((u) => sb().from("kosha_recurring_rules").update({ next_due: u.next_due, ...(u.archived ? { archived: true } : {}) }).eq("id", u.id)),
  );
}

/** Runs materialization once per calendar day per browser session. */
export function useMaterializeOnLoad(userId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["kosha_materialize", userId, today()],
    enabled: !!userId,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      await materializeDueRules(userId!);
      invalidateRecurring(qc);
      return true;
    },
  });
}

/** The confirm inbox: materialized-but-unconfirmed occurrences. For transfers, only the outgoing leg is shown (confirming it confirms both). */
export function usePendingRecurring() {
  return useQuery({
    queryKey: ["kosha_transactions", "pendingRecurring"],
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await sb()
        .from("kosha_transactions")
        .select("*")
        .eq("status", "pending")
        .not("recurring_rule_id", "is", null)
        .or("type.neq.transfer,amount.lt.0")
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Confirms a pending occurrence, optionally with an edited amount (magnitude). Updates the rule's price memory and reports whether the price changed. */
export function useConfirmRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tx, confirmedMagnitude, rule }: { tx: Transaction; confirmedMagnitude: number; rule: RecurringRule }) => {
      const priceChanged = rule.last_confirmed_amount != null && rule.last_confirmed_amount !== confirmedMagnitude;

      if (tx.transfer_group_id) {
        const { data: legs, error: legsError } = await sb()
          .from("kosha_transactions")
          .select("*")
          .eq("transfer_group_id", tx.transfer_group_id);
        if (legsError) throw legsError;
        await Promise.all(
          (legs ?? []).map((leg) =>
            sb()
              .from("kosha_transactions")
              .update({ status: "cleared", amount: leg.amount < 0 ? -confirmedMagnitude : confirmedMagnitude })
              .eq("id", leg.id),
          ),
        );
      } else {
        const cashOut = tx.type === "expense" || tx.type === "investment_buy";
        const signed = cashOut ? -confirmedMagnitude : confirmedMagnitude;
        const { error } = await sb().from("kosha_transactions").update({ status: "cleared", amount: signed }).eq("id", tx.id);
        if (error) throw error;
      }

      const { error: ruleError } = await sb()
        .from("kosha_recurring_rules")
        .update({ amount: confirmedMagnitude, last_confirmed_amount: confirmedMagnitude })
        .eq("id", rule.id);
      if (ruleError) throw ruleError;

      return { priceChanged, delta: confirmedMagnitude - (rule.last_confirmed_amount ?? rule.amount) };
    },
    onSuccess: () => invalidateRecurring(qc),
  });
}
