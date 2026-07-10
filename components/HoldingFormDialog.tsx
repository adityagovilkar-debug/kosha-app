"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { useAccounts } from "@/lib/kosha/accounts";
import { useCreateHolding, useUpdateHolding } from "@/lib/kosha/holdings";
import type { AssetClass, Holding } from "@/lib/kosha/types";
import { errMessage } from "@/lib/errors";

const ASSET_CLASSES: { value: AssetClass; label: string; unitsTracked: boolean }[] = [
  { value: "equity_mf", label: "Equity fund", unitsTracked: true },
  { value: "debt_mf", label: "Debt fund", unitsTracked: true },
  { value: "stock", label: "Stock", unitsTracked: true },
  { value: "gold", label: "Gold", unitsTracked: true },
  { value: "crypto", label: "Crypto", unitsTracked: true },
  { value: "epf_ppf", label: "EPF / PPF", unitsTracked: false },
  { value: "fd", label: "Fixed deposit", unitsTracked: false },
  { value: "other", label: "Other", unitsTracked: false },
];

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Holding | null;
}

export function HoldingFormDialog({ open, onClose, editing }: Props) {
  const isEdit = !!editing;
  const { data: accounts } = useAccounts();
  const create = useCreateHolding();
  const update = useUpdateHolding();

  const investmentAccounts = (accounts ?? []).filter((a) => a.kind === "investment");

  const [name, setName] = useState(editing?.name ?? "");
  const [assetClass, setAssetClass] = useState<AssetClass>(editing?.asset_class ?? "equity_mf");
  const [accountId, setAccountId] = useState(editing?.account_id ?? investmentAccounts[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Give the holding a name");
    if (!accountId) return toast.error("Choose an investment account (create one in Accounts first)");
    const unitsTracked = ASSET_CLASSES.find((a) => a.value === assetClass)?.unitsTracked ?? true;
    setSaving(true);
    try {
      if (isEdit) {
        await update.mutateAsync({ id: editing!.id, patch: { name: name.trim(), asset_class: assetClass, account_id: accountId, units_tracked: unitsTracked } });
        toast.success("Holding updated");
      } else {
        await create.mutateAsync({ name: name.trim(), asset_class: assetClass, account_id: accountId, units_tracked: unitsTracked });
        toast.success("Holding added");
      }
      onClose();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit holding" : "New holding"}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nifty 50 Index Fund" autoFocus />
        </div>
        <div>
          <label className="label">Asset class</label>
          <div className="grid grid-cols-4 gap-2">
            {ASSET_CLASSES.map((a) => (
              <button
                type="button"
                key={a.value}
                onClick={() => setAssetClass(a.value)}
                className={`rounded-xl border py-2 text-xs font-medium transition ${
                  assetClass === a.value ? "border-brand-500 bg-brand-500/10 text-text" : "text-text-muted hover:bg-surface-2"
                }`}
                style={{ borderColor: assetClass === a.value ? undefined : "var(--border)" }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Investment account</label>
          {investmentAccounts.length === 0 ? (
            <p className="text-sm text-text-muted">No investment accounts yet — add one (kind “Investment”) in Accounts first.</p>
          ) : (
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {investmentAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button className="btn-primary w-full" disabled={saving || investmentAccounts.length === 0}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add holding"}
        </button>
      </form>
    </Modal>
  );
}
