"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Account, Transaction } from "./types";

const sb = supabaseBrowser;

async function uid(): Promise<string> {
  const {
    data: { user },
  } = await sb().auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

// =====================================================================
// EMI amortization — pure reducing-balance math (KOSHA-PLAN.md §6.3). All
// money is integer minor units (paise). The monthly rate is annual/12/100.
// =====================================================================

export interface AmortizationRow {
  index: number; // 1-based installment number
  emi: number; // minor units
  interest: number; // minor units
  principal: number; // minor units
  balance: number; // remaining principal after this installment, minor units
}

/** Standard EMI for a principal, monthly rate, and tenure. Returns minor units. */
export function computeEmi(principalMinor: number, annualRatePct: number, tenureMonths: number): number {
  if (tenureMonths <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return Math.round(principalMinor / tenureMonths);
  const factor = Math.pow(1 + r, tenureMonths);
  return Math.round((principalMinor * r * factor) / (factor - 1));
}

/**
 * Full amortization schedule. If `emiMinor` is provided it's used as-is
 * (matching what the user actually pays); otherwise it's derived. The
 * final installment absorbs any rounding drift so the balance lands
 * exactly at zero.
 */
export function computeSchedule(
  principalMinor: number,
  annualRatePct: number,
  tenureMonths: number,
  emiMinor?: number,
): AmortizationRow[] {
  const r = annualRatePct / 12 / 100;
  const emi = emiMinor && emiMinor > 0 ? emiMinor : computeEmi(principalMinor, annualRatePct, tenureMonths);
  const rows: AmortizationRow[] = [];
  let balance = principalMinor;

  for (let i = 1; i <= tenureMonths && balance > 0; i++) {
    const interest = Math.round(balance * r);
    let principal = emi - interest;
    const isLast = i === tenureMonths;
    // Last installment (or an overshoot) clears the remaining balance exactly.
    if (isLast || principal >= balance) {
      principal = balance;
      const actualEmi = principal + interest;
      rows.push({ index: i, emi: actualEmi, interest, principal, balance: 0 });
      balance = 0;
      break;
    }
    balance -= principal;
    rows.push({ index: i, emi, interest, principal, balance });
  }
  return rows;
}

/**
 * The principal/interest split of the *next* installment, given how many
 * installments have already been paid. Used to auto-fill a loan_payment.
 */
export function splitForInstallment(
  principalMinor: number,
  annualRatePct: number,
  tenureMonths: number,
  paidCount: number,
  emiMinor?: number,
): { interest: number; principal: number; emi: number } | null {
  const schedule = computeSchedule(principalMinor, annualRatePct, tenureMonths, emiMinor);
  const next = schedule[paidCount];
  if (!next) return null;
  return { interest: next.interest, principal: next.principal, emi: next.emi };
}

/** Recompute payoff if `prepayMinor` extra is applied to principal now, keeping EMI the same. Returns the new remaining schedule length + total interest. */
export function prepayImpact(
  outstandingMinor: number,
  annualRatePct: number,
  emiMinor: number,
  prepayMinor: number,
): { monthsLeft: number; totalInterest: number } {
  const startBalance = Math.max(0, outstandingMinor - prepayMinor);
  const r = annualRatePct / 12 / 100;
  let balance = startBalance;
  let months = 0;
  let totalInterest = 0;
  // Cap the loop so a too-small EMI (never amortizes) can't spin forever.
  while (balance > 0 && months < 1200) {
    const interest = Math.round(balance * r);
    let principal = emiMinor - interest;
    if (principal <= 0) return { monthsLeft: Infinity, totalInterest: Infinity }; // EMI doesn't even cover interest
    if (principal >= balance) principal = balance;
    balance -= principal;
    totalInterest += interest;
    months++;
  }
  return { monthsLeft: months, totalInterest };
}

// =====================================================================
// Loan payment logging
// =====================================================================

/** Number of loan_payment installments already posted against a loan account. */
export function useLoanPaymentCount(accountId: string | null) {
  return useQuery({
    queryKey: ["kosha_transactions", "loanPaymentCount", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await sb()
        .from("kosha_transactions")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId!)
        .eq("type", "loan_payment");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useLoanPayments(accountId: string | null) {
  return useQuery({
    queryKey: ["kosha_transactions", "loanPayments", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await sb()
        .from("kosha_transactions")
        .select("*")
        .eq("account_id", accountId!)
        .eq("type", "loan_payment")
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

interface LogLoanPaymentInput {
  loan: Account;
  fromAccountId: string; // the bank account the EMI is paid from
  date: string;
  emiMinor: number;
  principalMinor: number;
  interestMinor: number;
}

/**
 * Logs an EMI as a transfer-like pair (KOSHA-PLAN.md §6.3): money leaves
 * the bank account (loan_payment, negative, full EMI) and the loan
 * liability is reduced by the principal portion (a positive loan_payment on
 * the loan account moves its negative balance toward zero). The net effect
 * on net worth is exactly -interest, which is correct. The interest amount
 * is preserved in interest_component on the bank-side row for reports
 * rather than posted as a separate expense (which would double-count the
 * cash outflow). Both rows share a transfer_group_id so deleting one
 * removes the set.
 */
export function useLogLoanPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LogLoanPaymentInput) => {
      const user_id = await uid();
      const group = crypto.randomUUID();
      const rows = [
        // Cash leaving the bank account (full EMI).
        {
          user_id,
          account_id: input.fromAccountId,
          date: input.date,
          amount: -input.emiMinor,
          type: "loan_payment" as const,
          transfer_group_id: group,
          principal_component: input.principalMinor,
          interest_component: input.interestMinor,
          note: "EMI payment",
          tags: [],
        },
        // Principal reducing the loan liability (loan balance is negative;
        // a positive amount moves it toward zero).
        {
          user_id,
          account_id: input.loan.id,
          date: input.date,
          amount: input.principalMinor,
          type: "loan_payment" as const,
          transfer_group_id: group,
          note: "Principal repaid",
          tags: [],
        },
      ];
      const { error } = await sb().from("kosha_transactions").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kosha_transactions"] });
      qc.invalidateQueries({ queryKey: ["kosha_account_balances"] });
    },
  });
}
