"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "./Modal";
import { LoanPaymentDialog } from "./LoanPaymentDialog";
import { AmortizationTable } from "./AmortizationTable";
import { PrepaySlider } from "./PrepaySlider";
import { useLoanPaymentCount, useLoanPayments, computeSchedule } from "@/lib/kosha/loans";
import { useAccountBalances } from "@/lib/kosha/accounts";
import { formatMoney } from "@/lib/money";
import type { Account } from "@/lib/kosha/types";

interface Props {
  open: boolean;
  onClose: () => void;
  loan: Account | null;
}

type Tab = "schedule" | "prepay";

export function LoanDetailDialog({ open, onClose, loan }: Props) {
  const { data: paidCount } = useLoanPaymentCount(loan?.id ?? null);
  const { data: payments } = useLoanPayments(loan?.id ?? null);
  const { data: balances } = useAccountBalances();
  const [payOpen, setPayOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("schedule");

  const interestPaid = useMemo(
    () => (payments ?? []).reduce((sum, p) => sum + (p.interest_component ?? 0), 0),
    [payments],
  );

  const outstanding = loan ? Math.abs(loan.opening_balance + (balances?.[loan.id] ?? 0)) : 0;

  const payoffMonthsLeft = useMemo(() => {
    if (!loan || loan.loan_principal == null || loan.interest_rate_pct == null || loan.tenure_months == null) return null;
    const schedule = computeSchedule(loan.loan_principal, loan.interest_rate_pct, loan.tenure_months, loan.emi_amount ?? undefined);
    return schedule.length - (paidCount ?? 0);
  }, [loan, paidCount]);

  if (!loan) return null;

  return (
    <>
      <Modal open={open} onClose={onClose} title={loan.name}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3">
              <p className="text-xs text-text-muted">Outstanding</p>
              <p className="money text-lg font-bold text-expense">{formatMoney(outstanding)}</p>
            </div>
            <div className="card p-3">
              <p className="text-xs text-text-muted">Interest paid</p>
              <p className="money text-lg font-bold">{formatMoney(interestPaid)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-text-muted">
            <span>{paidCount ?? 0} paid{payoffMonthsLeft != null && ` · ${payoffMonthsLeft} left`}</span>
            <button className="btn-primary !min-h-0 !py-1.5 !px-3 text-sm" onClick={() => setPayOpen(true)}>
              <Plus className="h-4 w-4" /> Pay EMI
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            <button
              onClick={() => setTab("schedule")}
              className={`rounded-lg py-2 text-sm font-semibold transition ${tab === "schedule" ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}
            >
              Schedule
            </button>
            <button
              onClick={() => setTab("prepay")}
              className={`rounded-lg py-2 text-sm font-semibold transition ${tab === "prepay" ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}
            >
              What if I prepay?
            </button>
          </div>

          {tab === "schedule" ? (
            <AmortizationTable loan={loan} paidCount={paidCount ?? 0} />
          ) : (
            <PrepaySlider loan={loan} paidCount={paidCount ?? 0} />
          )}
        </div>
      </Modal>

      <LoanPaymentDialog open={payOpen} onClose={() => setPayOpen(false)} loan={loan} />
    </>
  );
}
