"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { useAccounts } from "@/lib/kosha/accounts";
import { useLoanPaymentCount, splitForInstallment, useLogLoanPayment } from "@/lib/kosha/loans";
import { formatMoney } from "@/lib/money";
import type { Account } from "@/lib/kosha/types";
import { errMessage } from "@/lib/errors";

interface Props {
  open: boolean;
  onClose: () => void;
  loan: Account;
}

export function LoanPaymentDialog({ open, onClose, loan }: Props) {
  const { data: accounts } = useAccounts();
  const { data: paidCount } = useLoanPaymentCount(loan.id);
  const logPayment = useLogLoanPayment();

  const bankAccounts = (accounts ?? []).filter((a) => a.id !== loan.id && (a.kind === "bank" || a.kind === "wallet" || a.kind === "cash"));
  const [fromAccountId, setFromAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const canCompute =
    loan.loan_principal != null && loan.interest_rate_pct != null && loan.tenure_months != null && loan.emi_amount != null;

  const split =
    canCompute && paidCount != null
      ? splitForInstallment(loan.loan_principal!, loan.interest_rate_pct!, loan.tenure_months!, paidCount, loan.emi_amount!)
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!split) return toast.error("This loan is missing its rate/tenure/EMI — edit the account to add them.");
    if (!fromAccountId) return toast.error("Choose the account you're paying from");
    setSaving(true);
    try {
      await logPayment.mutateAsync({
        loan,
        fromAccountId,
        date,
        emiMinor: split.emi,
        principalMinor: split.principal,
        interestMinor: split.interest,
      });
      toast.success("EMI payment logged");
      onClose();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Pay EMI — ${loan.name}`}>
      <form onSubmit={onSubmit} className="space-y-4">
        {!canCompute && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-400/10 p-3 text-sm text-amber-600">
            This loan is missing its interest rate, tenure, or EMI amount. Edit the account to add them so the split can be computed.
          </p>
        )}

        {split && (
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
            <p className="mb-2 text-sm font-semibold">Installment #{(paidCount ?? 0) + 1}</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-text-muted">EMI</p>
                <p className="money font-bold">{formatMoney(split.emi)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Principal</p>
                <p className="money font-bold text-income">{formatMoney(split.principal)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Interest</p>
                <p className="money font-bold text-expense">{formatMoney(split.interest)}</p>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="label">Pay from</label>
          <select className="select" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
            <option value="">Choose account…</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <button className="btn-primary w-full" disabled={saving || !split}>
          {saving ? "Saving…" : "Log EMI payment"}
        </button>
      </form>
    </Modal>
  );
}
