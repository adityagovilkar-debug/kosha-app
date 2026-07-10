"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { useCreateAccount, useUpdateAccount } from "@/lib/kosha/accounts";
import { rupeesToMinor, minorToRupees } from "@/lib/money";
import { PALETTE_KEYS, paletteColor } from "@/lib/palette";
import type { Account, AccountKind } from "@/lib/kosha/types";
import { errMessage } from "@/lib/errors";

const KIND_OPTIONS: { value: AccountKind; label: string; icon: string }[] = [
  { value: "bank", label: "Bank", icon: "🏦" },
  { value: "cash", label: "Cash", icon: "💵" },
  { value: "wallet", label: "Wallet (UPI)", icon: "📱" },
  { value: "credit_card", label: "Credit Card", icon: "💳" },
  { value: "investment", label: "Investment", icon: "📈" },
  { value: "loan", label: "Loan", icon: "🏛️" },
  { value: "other", label: "Other", icon: "💰" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  account?: Account | null;
}

export function AccountFormDialog({ open, onClose, account }: Props) {
  const isEdit = !!account;
  const create = useCreateAccount();
  const update = useUpdateAccount();

  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "bank");
  const [currency, setCurrency] = useState(account?.currency ?? "INR");
  const [openingBalance, setOpeningBalance] = useState(
    account ? String(minorToRupees(account.opening_balance)) : "0",
  );
  const [openingDate, setOpeningDate] = useState(account?.opening_date ?? new Date().toISOString().slice(0, 10));
  const [icon, setIcon] = useState(account?.icon ?? KIND_OPTIONS[0].icon);
  const [color, setColor] = useState(account?.color ?? "violet");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Give the account a name");
      return;
    }
    const balance = parseFloat(openingBalance || "0");
    if (Number.isNaN(balance)) {
      toast.error("Opening balance must be a number");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        kind,
        currency: currency.trim().toUpperCase() || "INR",
        opening_balance: rupeesToMinor(balance),
        opening_date: openingDate,
        color,
        icon,
      };
      if (isEdit) {
        await update.mutateAsync({ id: account!.id, patch: payload });
        toast.success("Account updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Account created");
      }
      onClose();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit account" : "New account"}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Savings" autoFocus />
        </div>

        <div>
          <label className="label">Type</label>
          <div className="grid grid-cols-4 gap-2">
            {KIND_OPTIONS.map((k) => (
              <button
                type="button"
                key={k.value}
                onClick={() => {
                  setKind(k.value);
                  if (!account) setIcon(k.icon);
                }}
                className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium transition ${
                  kind === k.value ? "border-brand-500 bg-brand-500/10 text-text" : "text-text-muted hover:bg-surface-2"
                }`}
              >
                <span className="text-xl">{k.icon}</span>
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Opening balance</label>
            <input
              className="input money"
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Currency</label>
            <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
          </div>
        </div>

        <div>
          <label className="label">Opening date</label>
          <input className="input" type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
        </div>

        <div>
          <label className="label">Color</label>
          <div className="flex flex-wrap gap-2">
            {PALETTE_KEYS.map((key) => (
              <button
                type="button"
                key={key}
                onClick={() => setColor(key)}
                className="h-8 w-8 rounded-full ring-offset-2 ring-offset-surface transition"
                style={{ backgroundColor: paletteColor(key), boxShadow: color === key ? `0 0 0 2px ${paletteColor(key)}` : undefined }}
                aria-label={key}
              />
            ))}
          </div>
        </div>

        <button className="btn-primary w-full" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create account"}
        </button>
      </form>
    </Modal>
  );
}
