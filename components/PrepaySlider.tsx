"use client";

import { useMemo, useState } from "react";
import { prepayImpact, computeSchedule } from "@/lib/kosha/loans";
import { formatMoney } from "@/lib/money";
import type { Account } from "@/lib/kosha/types";

interface Props {
  loan: Account;
  paidCount: number;
}

// "What if I prepay ₹X" — recomputes payoff entirely client-side
// (KOSHA-PLAN.md §6.3). Compares months-left and total remaining interest
// with vs without the lump sum.
export function PrepaySlider({ loan, paidCount }: Props) {
  const canCompute =
    loan.loan_principal != null && loan.interest_rate_pct != null && loan.tenure_months != null && loan.emi_amount != null;

  // Outstanding balance = the schedule's balance after the last paid installment.
  const outstanding = useMemo(() => {
    if (!canCompute) return 0;
    const schedule = computeSchedule(loan.loan_principal!, loan.interest_rate_pct!, loan.tenure_months!, loan.emi_amount!);
    if (paidCount <= 0) return loan.loan_principal!;
    return schedule[paidCount - 1]?.balance ?? 0;
  }, [loan, paidCount, canCompute]);

  const [prepay, setPrepay] = useState(0);

  if (!canCompute || outstanding <= 0) {
    return <p className="text-sm text-text-muted">Nothing left to prepay.</p>;
  }

  const baseline = prepayImpact(outstanding, loan.interest_rate_pct!, loan.emi_amount!, 0);
  const withPrepay = prepayImpact(outstanding, loan.interest_rate_pct!, loan.emi_amount!, prepay);

  const monthsSaved = Number.isFinite(baseline.monthsLeft) && Number.isFinite(withPrepay.monthsLeft) ? baseline.monthsLeft - withPrepay.monthsLeft : 0;
  const interestSaved = Number.isFinite(baseline.totalInterest) && Number.isFinite(withPrepay.totalInterest) ? baseline.totalInterest - withPrepay.totalInterest : 0;

  const maxPrepay = outstanding;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="label !mb-0">Prepay a lump sum</label>
        <span className="money text-sm font-bold">{formatMoney(prepay)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={maxPrepay}
        step={Math.max(1, Math.round(maxPrepay / 100))}
        value={prepay}
        onChange={(e) => setPrepay(parseInt(e.target.value))}
        className="w-full accent-brand-500"
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3 text-center">
          <p className="text-xs text-text-muted">Months saved</p>
          <p className="money text-xl font-bold text-income">{monthsSaved > 0 ? monthsSaved : 0}</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xs text-text-muted">Interest saved</p>
          <p className="money text-xl font-bold text-income">{formatMoney(interestSaved > 0 ? interestSaved : 0)}</p>
        </div>
      </div>
      <p className="text-xs text-text-muted">
        Paying {formatMoney(prepay)} now clears the loan in {Number.isFinite(withPrepay.monthsLeft) ? withPrepay.monthsLeft : "∞"} months instead of{" "}
        {Number.isFinite(baseline.monthsLeft) ? baseline.monthsLeft : "∞"}.
      </p>
    </div>
  );
}
