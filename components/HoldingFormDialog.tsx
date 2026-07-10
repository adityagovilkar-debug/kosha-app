"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { useAccounts } from "@/lib/kosha/accounts";
import { useCreateHolding, useUpdateHolding } from "@/lib/kosha/holdings";
import { searchAmfiSchemes, type AmfiMatch } from "@/lib/kosha/nav";
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

const isMutualFund = (c: AssetClass) => c === "equity_mf" || c === "debt_mf";

export function HoldingFormDialog({ open, onClose, editing }: Props) {
  const isEdit = !!editing;
  const { data: accounts } = useAccounts();
  const create = useCreateHolding();
  const update = useUpdateHolding();

  const investmentAccounts = (accounts ?? []).filter((a) => a.kind === "investment");

  const [name, setName] = useState(editing?.name ?? "");
  const [assetClass, setAssetClass] = useState<AssetClass>(editing?.asset_class ?? "equity_mf");
  const [accountId, setAccountId] = useState(editing?.account_id ?? investmentAccounts[0]?.id ?? "");
  const [amfiCode, setAmfiCode] = useState<string | null>(editing?.amfi_code ?? null);
  const [amfiName, setAmfiName] = useState<string | null>(null);
  const [schemeQuery, setSchemeQuery] = useState("");
  const [schemeResults, setSchemeResults] = useState<AmfiMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function onSchemeQueryChange(value: string) {
    setSchemeQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length < 3) {
      setSchemeResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        setSchemeResults(await searchAmfiSchemes(value.trim()));
      } catch {
        setSchemeResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Give the holding a name");
    if (!accountId) return toast.error("Choose an investment account (create one in Accounts first)");
    const unitsTracked = ASSET_CLASSES.find((a) => a.value === assetClass)?.unitsTracked ?? true;
    const amfi_code = isMutualFund(assetClass) ? amfiCode : null;
    setSaving(true);
    try {
      if (isEdit) {
        await update.mutateAsync({ id: editing!.id, patch: { name: name.trim(), asset_class: assetClass, account_id: accountId, units_tracked: unitsTracked, amfi_code } });
        toast.success("Holding updated");
      } else {
        await create.mutateAsync({ name: name.trim(), asset_class: assetClass, account_id: accountId, units_tracked: unitsTracked, amfi_code });
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
        {isMutualFund(assetClass) && (
          <div>
            <label className="label">Auto-fetch NAV (AMFI)</label>
            {amfiCode ? (
              <div className="flex items-center gap-2 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                <span className="min-w-0 flex-1 truncate">
                  {amfiName ?? `Scheme code ${amfiCode}`}
                  <span className="block text-xs text-text-muted">Daily NAV updates on the Wealth page</span>
                </span>
                <button
                  type="button"
                  className="btn-ghost !min-h-0 shrink-0 !py-1 !px-2 text-xs"
                  onClick={() => {
                    setAmfiCode(null);
                    setAmfiName(null);
                  }}
                >
                  Unlink
                </button>
              </div>
            ) : (
              <>
                <input
                  className="input"
                  placeholder="Search the fund, e.g. UTI Nifty Index Direct Growth"
                  value={schemeQuery}
                  onChange={(e) => onSchemeQueryChange(e.target.value)}
                />
                {searching && <p className="mt-1 text-xs text-text-muted">Searching…</p>}
                {schemeResults.length > 0 && (
                  <div className="mt-1 max-h-44 overflow-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
                    {schemeResults.map((s) => (
                      <button
                        key={s.code}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-xs hover:bg-surface-2"
                        onClick={() => {
                          setAmfiCode(s.code);
                          setAmfiName(s.name);
                          setSchemeResults([]);
                          setSchemeQuery("");
                          if (!name.trim()) setName(s.name);
                        }}
                      >
                        <span className="block truncate font-medium">{s.name}</span>
                        <span className="text-text-muted">NAV ₹{s.nav} · {s.date}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-text-muted">Optional — link the scheme once and prices update themselves.</p>
              </>
            )}
          </div>
        )}

        <button className="btn-primary w-full" disabled={saving || investmentAccounts.length === 0}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add holding"}
        </button>
      </form>
    </Modal>
  );
}
