"use client";

import { useMemo } from "react";
import { computeSchedule } from "@/lib/kosha/loans";
import { formatMoney } from "@/lib/money";
import type { Account } from "@/lib/kosha/types";

interface Props {
  loan: Account;
  paidCount: number;
}

export function AmortizationTable({ loan, paidCount }: Props) {
  const schedule = useMemo(() => {
    if (loan.loan_principal == null || loan.interest_rate_pct == null || loan.tenure_months == null) return [];
    return computeSchedule(loan.loan_principal, loan.interest_rate_pct, loan.tenure_months, loan.emi_amount ?? undefined);
  }, [loan]);

  if (schedule.length === 0) {
    return <p className="text-sm text-text-muted">Add this loan&apos;s principal, rate, and tenure to see its schedule.</p>;
  }

  return (
    <div className="max-h-96 overflow-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-2 text-text-muted">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">#</th>
            <th className="px-3 py-2 text-right font-semibold">EMI</th>
            <th className="px-3 py-2 text-right font-semibold">Principal</th>
            <th className="px-3 py-2 text-right font-semibold">Interest</th>
            <th className="px-3 py-2 text-right font-semibold">Balance</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((row) => (
            <tr
              key={row.index}
              className={`border-t ${row.index <= paidCount ? "text-text-muted line-through opacity-60" : ""}`}
              style={{ borderColor: "var(--border)" }}
            >
              <td className="px-3 py-1.5">{row.index}</td>
              <td className="money px-3 py-1.5 text-right">{formatMoney(row.emi)}</td>
              <td className="money px-3 py-1.5 text-right">{formatMoney(row.principal)}</td>
              <td className="money px-3 py-1.5 text-right">{formatMoney(row.interest)}</td>
              <td className="money px-3 py-1.5 text-right">{formatMoney(row.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
