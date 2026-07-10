"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { useSetHoldingPrice } from "@/lib/kosha/holdings";
import type { Holding } from "@/lib/kosha/types";
import { errMessage } from "@/lib/errors";

interface Props {
  open: boolean;
  onClose: () => void;
  holding: Holding;
  currentPrice?: number;
}

export function UpdatePriceDialog({ open, onClose, holding, currentPrice }: Props) {
  const setPrice = useSetHoldingPrice();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [price, setPriceInput] = useState(currentPrice ? String(currentPrice) : "");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const p = parseFloat(price);
    if (!Number.isFinite(p) || p <= 0) return toast.error("Enter a valid price");
    setSaving(true);
    try {
      await setPrice.mutateAsync({ holdingId: holding.id, date, price: p });
      toast.success("Price updated");
      onClose();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Update price — ${holding.name}`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">As of date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Price / unit (₹)</label>
            <input className="input money" type="number" step="0.0001" value={price} onChange={(e) => setPriceInput(e.target.value)} autoFocus placeholder="0" />
          </div>
        </div>
        <button className="btn-primary w-full" disabled={saving}>
          {saving ? "Saving…" : "Save price"}
        </button>
      </form>
    </Modal>
  );
}
