"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, RefreshCw } from "lucide-react";
import { Modal } from "./Modal";
import { InvestmentTxnDialog } from "./InvestmentTxnDialog";
import { UpdatePriceDialog } from "./UpdatePriceDialog";
import { useHoldingTransactions, useLatestPrices, summarizeHolding } from "@/lib/kosha/holdings";
import { formatMoney, formatMoneySigned } from "@/lib/money";
import type { Holding } from "@/lib/kosha/types";

interface Props {
  open: boolean;
  onClose: () => void;
  holding: Holding | null;
}

export function HoldingDetailDialog({ open, onClose, holding }: Props) {
  const { data: txns } = useHoldingTransactions(holding?.id ?? null);
  const { data: latestPrices } = useLatestPrices();
  const [txnOpen, setTxnOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  const summary = useMemo(
    () => (holding ? summarizeHolding(holding, txns ?? [], latestPrices?.[holding.id]) : null),
    [holding, txns, latestPrices],
  );

  if (!holding) return null;
  const latestPrice = latestPrices?.[holding.id];

  return (
    <>
      <Modal open={open} onClose={onClose} title={holding.name}>
        <div className="space-y-4">
          {summary && (
            <div className="grid grid-cols-2 gap-3">
              <div className="card p-3">
                <p className="text-xs text-text-muted">Current value</p>
                <p className="money text-lg font-bold">{formatMoney(summary.currentValue)}</p>
              </div>
              <div className="card p-3">
                <p className="text-xs text-text-muted">Invested</p>
                <p className="money text-lg font-bold">{formatMoney(summary.investedNet)}</p>
              </div>
              <div className="card p-3">
                <p className="text-xs text-text-muted">Return</p>
                <p className={`money text-lg font-bold ${summary.absoluteReturn >= 0 ? "text-income" : "text-expense"}`}>
                  {formatMoneySigned(summary.absoluteReturn)}
                </p>
              </div>
              <div className="card p-3">
                <p className="text-xs text-text-muted">XIRR</p>
                <p className={`money text-lg font-bold ${(summary.xirrPct ?? 0) >= 0 ? "text-income" : "text-expense"}`}>
                  {summary.xirrPct != null ? `${(summary.xirrPct * 100).toFixed(1)}%` : "—"}
                </p>
              </div>
            </div>
          )}

          {holding.units_tracked && (
            <p className="text-center text-sm text-text-muted">
              {summary?.units.toLocaleString("en-IN", { maximumFractionDigits: 4 })} units
              {latestPrice && ` · ₹${latestPrice.price} as of ${format(parseISO(latestPrice.date), "MMM d")}`}
            </p>
          )}

          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => setTxnOpen(true)}>
              <Plus className="h-4 w-4" /> Record
            </button>
            {holding.units_tracked && (
              <button className="btn-outline flex-1" onClick={() => setPriceOpen(true)}>
                <RefreshCw className="h-4 w-4" /> Update price
              </button>
            )}
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold text-text-muted">History</p>
            {(txns?.length ?? 0) === 0 ? (
              <p className="text-sm text-text-muted">No transactions yet.</p>
            ) : (
              <div className="card divide-y divide-[var(--border)]">
                {(txns ?? []).slice().reverse().map((tx) => (
                  <div key={tx.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="flex-1">
                      <span className="font-medium capitalize">{tx.type.replace("investment_", "").replace("_", " ")}</span>
                      <span className="text-text-muted"> · {format(parseISO(tx.date), "MMM d, yyyy")}</span>
                      {tx.qty != null && <span className="text-text-muted"> · {tx.qty} @ ₹{tx.unit_price}</span>}
                    </span>
                    <span className="money font-semibold">{formatMoneySigned(tx.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <InvestmentTxnDialog open={txnOpen} onClose={() => setTxnOpen(false)} holding={holding} />
      <UpdatePriceDialog open={priceOpen} onClose={() => setPriceOpen(false)} holding={holding} currentPrice={latestPrice?.price} />
    </>
  );
}
