"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { useCreateTransaction } from "@/lib/kosha/transactions";
import { rupeesToMinor, formatMoney } from "@/lib/money";
import type { Holding } from "@/lib/kosha/types";
import { errMessage } from "@/lib/errors";

type Kind = "investment_buy" | "investment_sell" | "dividend";

const KIND_LABELS: Record<Kind, string> = {
  investment_buy: "Buy",
  investment_sell: "Sell",
  dividend: "Dividend",
};

interface Props {
  open: boolean;
  onClose: () => void;
  holding: Holding;
}

// Records a buy/sell/dividend against a holding. For unit-tracked holdings,
// the amount is qty × unit_price; for non-unit holdings (PPF, FD) the user
// enters the amount directly.
export function InvestmentTxnDialog({ open, onClose, holding }: Props) {
  const create = useCreateTransaction();
  const [kind, setKind] = useState<Kind>("investment_buy");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [saving, setSaving] = useState(false);

  const tracksUnits = holding.units_tracked && kind !== "dividend";
  const computedAmount = tracksUnits
    ? (() => {
        const q = parseFloat(qty);
        const p = parseFloat(unitPrice);
        return Number.isFinite(q) && Number.isFinite(p) ? rupeesToMinor(q * p) : null;
      })()
    : (() => {
        const a = parseFloat(amountInput);
        return Number.isFinite(a) ? rupeesToMinor(a) : null;
      })();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!computedAmount || computedAmount <= 0) return toast.error("Enter a valid amount");
    setSaving(true);
    try {
      // Sign convention matches other account transactions: a buy is cash
      // out of the investment account (negative), a sell or dividend is
      // cash in (positive). Net worth revalues via latest price separately.
      const signed = kind === "investment_buy" ? -computedAmount : computedAmount;
      await create.mutateAsync({
        account_id: holding.account_id,
        holding_id: holding.id,
        date,
        amount: signed,
        type: kind,
        qty: tracksUnits ? parseFloat(qty) : null,
        unit_price: tracksUnits ? parseFloat(unitPrice) : null,
        note: KIND_LABELS[kind],
      });
      toast.success(`${KIND_LABELS[kind]} recorded`);
      onClose();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={holding.name}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-lg py-2 text-sm font-semibold transition ${kind === k ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>

        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {tracksUnits ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Units</label>
              <input className="input money" type="number" step="0.0001" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Price / unit (₹)</label>
              <input className="input money" type="number" step="0.0001" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0" />
            </div>
          </div>
        ) : (
          <div>
            <label className="label">Amount (₹)</label>
            <input className="input money" type="number" step="0.01" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder="0" />
          </div>
        )}

        {computedAmount !== null && (
          <p className="money text-center text-sm text-text-muted">Total: {formatMoney(computedAmount)}</p>
        )}

        <button className="btn-primary w-full" disabled={saving}>
          {saving ? "Saving…" : `Record ${KIND_LABELS[kind].toLowerCase()}`}
        </button>
      </form>
    </Modal>
  );
}
