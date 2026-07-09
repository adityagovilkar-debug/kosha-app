"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Delete, Plus, Trash2, ArrowRightLeft, Paperclip } from "lucide-react";
import { Modal } from "./Modal";
import { useQuickAdd } from "./QuickAddProvider";
import { useAccounts } from "@/lib/kosha/accounts";
import { useCategories, groupCategories } from "@/lib/kosha/categories";
import {
  useCreateTransaction,
  useCreateTransfer,
  useCreateSplitTransaction,
  useUpdateTransaction,
} from "@/lib/kosha/transactions";
import { useRecentPayees } from "@/lib/kosha/payees";
import { COMMON_CURRENCIES, useFxRate } from "@/lib/kosha/fx";
import { useTripMode } from "@/lib/kosha/settings";
import { useUploadReceipt, useReceipt, useReceiptImageUrl } from "@/lib/kosha/receipts";
import { parseAmountInput, formatMoney, minorToRupees } from "@/lib/money";
import { paletteColor } from "@/lib/palette";
import type { CategoryKind, Transaction } from "@/lib/kosha/types";

type Mode = "expense" | "income" | "transfer";
const LAST_ACCOUNT_KEY = "kosha-last-account";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "⌫"];

function today() {
  return new Date().toISOString().slice(0, 10);
}
function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function modeForTransaction(tx: Transaction): Mode {
  return tx.type === "income" ? "income" : tx.type === "transfer" ? "transfer" : "expense";
}

interface SplitRow {
  key: string;
  categoryId: string;
  amount: string;
}

// Thin wrapper: the Modal only ever shows one "session" at a time, and a
// fresh QuickAddForm instance (keyed by what's being edited) is mounted
// each time it opens — so all form state initializes directly from
// `editing` via useState initializers instead of an effect that resets
// state on every prop change.
export function QuickAddSheet() {
  const { isOpen, editing, close } = useQuickAdd();
  return (
    <Modal open={isOpen} onClose={close} title={editing ? "Edit transaction" : "Add transaction"}>
      {isOpen && <QuickAddForm key={editing?.id ?? "new"} editing={editing} close={close} />}
    </Modal>
  );
}

function QuickAddForm({ editing, close }: { editing: Transaction | null; close: () => void }) {
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data: recentPayees } = useRecentPayees();

  const createTx = useCreateTransaction();
  const createTransfer = useCreateTransfer();
  const createSplit = useCreateSplitTransaction();
  const updateTx = useUpdateTransaction();

  const [mode, setMode] = useState<Mode>(() => (editing ? modeForTransaction(editing) : "expense"));
  const [amount, setAmount] = useState(() => (editing ? String(minorToRupees(Math.abs(editing.amount))) : ""));
  const [accountId, setAccountId] = useState(() => {
    if (editing) return editing.account_id;
    return (typeof window !== "undefined" && localStorage.getItem(LAST_ACCOUNT_KEY)) || "";
  });
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(() => editing?.category_id ?? null);
  const [date, setDate] = useState(() => editing?.date ?? today());
  const [payee, setPayee] = useState(() => editing?.payee ?? "");
  const [note, setNote] = useState(() => editing?.note ?? "");
  const trip = useTripMode();
  const [tagsInput, setTagsInput] = useState(() => {
    if (editing) return (editing.tags ?? []).join(", ");
    return trip?.enabled ? trip.tag : "";
  });
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [receiptId, setReceiptId] = useState<string | null>(editing?.receipt_id ?? null);
  const uploadReceipt = useUploadReceipt();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: receiptRow } = useReceipt(receiptId);
  const { data: receiptUrl } = useReceiptImageUrl(receiptRow?.storage_path ?? null);

  // Multi-currency (Phase 3, KOSHA-PLAN.md §3.3 + §5). The keypad amount is
  // in whichever `currency` is selected; when it differs from INR it's
  // converted using the fetched (or overridden) rate. This assumes the
  // owning account is itself INR-denominated, true for every account in
  // this app so far — genuinely foreign-currency accounts aren't handled.
  const [currency, setCurrency] = useState(() => {
    if (editing) return editing.original_currency ?? "INR";
    return trip?.enabled ? trip.currency : "INR";
  });
  const [fxRateOverride, setFxRateOverride] = useState(() => (editing?.fx_rate ? String(editing.fx_rate) : ""));
  const isForeign = mode !== "transfer" && !splitMode && currency !== "INR";
  const { data: fetchedRate, isLoading: fxLoading } = useFxRate(date, currency, isForeign);
  const effectiveRate = fxRateOverride ? parseFloat(fxRateOverride) : fetchedRate;

  // Derived, not stored: falls back to the first account once accounts
  // finish loading, if nothing was picked from localStorage. Avoids an
  // effect that would just be mirroring async data into state.
  const effectiveAccountId = accountId || accounts?.[0]?.id || "";

  const kindForMode: CategoryKind = mode === "income" ? "income" : "expense";
  const leafCategories = useMemo(() => {
    const groups = groupCategories(categories ?? []);
    return groups.filter((g) => g.kind === kindForMode).flatMap((g) => g.children);
  }, [categories, kindForMode]);

  // `total` is in whichever `currency` is selected; `accountAmount` is
  // always the account-currency (INR) value actually stored on the
  // transaction. They're the same number unless isForeign is true.
  const total = parseAmountInput(amount);
  const accountAmount = isForeign ? (total !== null && effectiveRate ? Math.round(total * effectiveRate) : null) : total;
  const splitTotal = splits.reduce((sum, s) => sum + (parseAmountInput(s.amount) ?? 0), 0);
  const splitsValid = splitMode && splits.length > 0 && total !== null && splitTotal === total && splits.every((s) => s.categoryId);

  function pressKey(k: string) {
    if (k === "⌫") {
      setAmount((a) => a.slice(0, -1));
      return;
    }
    setAmount((a) => {
      if (k === "+" && (a === "" || a.endsWith("+"))) return a; // no leading/double +
      if (k === "." && /(^|\+)[^+]*\.[^+]*$/.test(a + k)) return a; // one decimal per addend
      return a + k;
    });
  }

  async function onReceiptSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    try {
      const result = await uploadReceipt.mutateAsync(file);
      setReceiptId(result.receiptId);
      const ex = result.extracted;
      if (ex) {
        if (ex.merchant) setPayee(ex.merchant);
        if (ex.date) setDate(ex.date);
        if (ex.total != null) setAmount(String(minorToRupees(ex.total)));
        if (ex.currency && ex.currency !== "INR") setCurrency(ex.currency);
        toast.success("Receipt scanned — check the details below");
      } else {
        toast("Receipt attached — fill in the details");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't upload that receipt");
    }
  }

  function addSplitRow() {
    setSplits((s) => [...s, { key: crypto.randomUUID(), categoryId: "", amount: "" }]);
  }
  function updateSplitRow(key: string, patch: Partial<SplitRow>) {
    setSplits((s) => s.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function removeSplitRow(key: string) {
    setSplits((s) => s.filter((row) => row.key !== key));
  }

  function resetForNext() {
    setAmount("");
    setPayee("");
    setNote("");
    setTagsInput("");
    setSplitMode(false);
    setSplits([]);
    // keep mode, account, category, date — fastest path for repeated entries
  }

  async function submit(keepOpen: boolean) {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (mode === "transfer") {
        if (!total) return toast.error("Enter an amount");
        if (!effectiveAccountId || !toAccountId) return toast.error("Choose both accounts");
        if (effectiveAccountId === toAccountId) return toast.error("Pick two different accounts");
        setSaving(true);
        await createTransfer.mutateAsync({ fromAccountId: effectiveAccountId, toAccountId, date, amount: total, note, tags });
      } else if (splitMode) {
        if (!splitsValid) return toast.error(total === null ? "Enter an amount" : "Splits must add up to the total and each need a category");
        if (!effectiveAccountId) return toast.error("Choose an account");
        setSaving(true);
        await createSplit.mutateAsync({
          account_id: effectiveAccountId,
          date,
          type: mode,
          payee: payee || undefined,
          note: note || undefined,
          tags,
          splits: splits.map((s) => ({ category_id: s.categoryId, amount: parseAmountInput(s.amount)! })),
        });
        localStorage.setItem(LAST_ACCOUNT_KEY, effectiveAccountId);
      } else {
        if (!total) return toast.error("Enter an amount");
        if (isForeign && !effectiveRate) return toast.error("Still fetching the exchange rate — try again in a moment");
        if (!accountAmount) return toast.error("Enter an amount");
        if (!effectiveAccountId) return toast.error("Choose an account");
        const signed = mode === "expense" ? -accountAmount : accountAmount;
        const currencyFields = isForeign
          ? { original_currency: currency, original_amount: total, fx_rate: effectiveRate, base_amount: accountAmount }
          : { original_currency: null, original_amount: null, fx_rate: null, base_amount: accountAmount };
        setSaving(true);
        if (editing) {
          await updateTx.mutateAsync({
            id: editing.id,
            patch: { account_id: effectiveAccountId, date, amount: signed, type: mode, category_id: categoryId, payee: payee || undefined, note: note || undefined, tags, receipt_id: receiptId, ...currencyFields },
          });
        } else {
          await createTx.mutateAsync({
            account_id: effectiveAccountId,
            date,
            amount: signed,
            type: mode,
            category_id: categoryId,
            payee: payee || undefined,
            receipt_id: receiptId,
            note: note || undefined,
            ...currencyFields,
            tags,
          });
          localStorage.setItem(LAST_ACCOUNT_KEY, effectiveAccountId);
        }
      }
      toast.success(editing ? "Transaction updated" : "Saved ✓");
      if (keepOpen && !editing) {
        resetForNext();
      } else {
        close();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const activeAccounts = accounts ?? [];

  return (
    <div className="space-y-4">
      {/* Type tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {(["expense", "income", "transfer"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            disabled={!!editing}
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 text-sm font-semibold capitalize transition disabled:opacity-40 ${
              mode === m ? "bg-surface text-text shadow-sm" : "text-text-muted"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div className="rounded-2xl border p-4 text-center" style={{ borderColor: "var(--border)" }}>
        {mode !== "transfer" && !splitMode && (
          <select
            className="select mx-auto mb-2 w-auto !min-h-0 !py-1 text-xs font-semibold"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          >
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <p className={`money text-4xl font-bold ${mode === "expense" ? "text-expense" : mode === "income" ? "text-income" : "text-text"}`}>
          {amount ? amount : "0"}
        </p>
        {total !== null && amount.includes("+") && !isForeign && (
          <p className="money mt-1 text-sm text-text-muted">= {formatMoney(total)}</p>
        )}
        {isForeign && (
          <p className="money mt-1 text-sm text-text-muted">
            {fxLoading ? "Fetching rate…" : accountAmount !== null ? `≈ ${formatMoney(accountAmount)}` : "Enter a rate below"}
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => pressKey(k)}
              className="btn-outline !min-h-[40px] text-lg font-semibold"
            >
              {k === "⌫" ? <Delete className="mx-auto h-5 w-5" /> : k}
            </button>
          ))}
        </div>
      </div>

      {isForeign && (
        <div className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex-1">
            <label className="label">Rate (₹ per {currency})</label>
            <input
              className="input money"
              type="number"
              step="0.0001"
              placeholder={fetchedRate ? fetchedRate.toFixed(4) : "…"}
              value={fxRateOverride}
              onChange={(e) => setFxRateOverride(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Transfer accounts, or single account + category */}
      {mode === "transfer" ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <select className="select" value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">From…</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>
          <ArrowRightLeft className="h-4 w-4 text-text-muted" />
          <select className="select" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            <option value="">To…</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <select className="select" value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Choose account…</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>

          {!splitMode && (
            <div>
              <div className="grid grid-cols-4 gap-2">
                {leafCategories.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-xs font-medium transition ${
                      categoryId === c.id ? "border-brand-500 bg-brand-500/10" : "hover:bg-surface-2"
                    }`}
                    style={{ borderColor: categoryId === c.id ? undefined : "var(--border)" }}
                  >
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full text-base"
                      style={{ backgroundColor: `${paletteColor(c.color)}26` }}
                    >
                      {c.emoji}
                    </span>
                    <span className="truncate w-full text-center">{c.name}</span>
                  </button>
                ))}
              </div>
              {leafCategories.length === 0 && (
                <p className="mt-2 text-sm text-text-muted">No {kindForMode} categories yet — add some in Categories.</p>
              )}
            </div>
          )}

          {!editing && (
            <button
              type="button"
              className="text-sm font-semibold text-brand-400"
              onClick={() => {
                setSplitMode((v) => !v);
                if (splits.length === 0) addSplitRow();
              }}
            >
              {splitMode ? "Use a single category instead" : "Split into multiple categories"}
            </button>
          )}

          {splitMode && (
            <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
              {splits.map((row) => (
                <div key={row.key} className="flex items-center gap-2">
                  <select
                    className="select flex-1"
                    value={row.categoryId}
                    onChange={(e) => updateSplitRow(row.key, { categoryId: e.target.value })}
                  >
                    <option value="">Category…</option>
                    {leafCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input money w-28"
                    placeholder="0"
                    value={row.amount}
                    onChange={(e) => updateSplitRow(row.key, { amount: e.target.value })}
                  />
                  <button type="button" className="btn-ghost !min-h-0 !p-2" onClick={() => removeSplitRow(row.key)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button type="button" className="text-sm font-semibold text-brand-400" onClick={addSplitRow}>
                <Plus className="mr-1 inline h-3.5 w-3.5" /> Add split
              </button>
              <p className={`text-xs ${total !== null && splitTotal === total ? "text-income" : "text-text-muted"}`}>
                {formatMoney(splitTotal)} of {total !== null ? formatMoney(total) : "—"}
              </p>
            </div>
          )}
        </>
      )}

      {/* Date */}
      <div className="flex items-center gap-2">
        <input className="input flex-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" className="btn-outline shrink-0" onClick={() => setDate(today())}>
          Today
        </button>
        <button type="button" className="btn-outline shrink-0" onClick={() => setDate(yesterday())}>
          Yesterday
        </button>
      </div>

      {mode !== "transfer" && (
        <div>
          <input
            className="input"
            list="kosha-payees"
            placeholder="Payee (optional)"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
          />
          <datalist id="kosha-payees">
            {(recentPayees ?? []).map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
      )}

      <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <input className="input" placeholder="Tags, comma separated (optional)" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />

      {mode !== "transfer" && !splitMode && (
        <>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onReceiptSelected} />
          {receiptId ? (
            <div className="flex items-center gap-2 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
              <Paperclip className="h-4 w-4 shrink-0 text-brand-400" />
              <span className="flex-1">Receipt attached</span>
              {receiptUrl && (
                <a href={receiptUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-400">
                  View
                </a>
              )}
              <button type="button" className="text-text-muted" onClick={() => setReceiptId(null)} aria-label="Remove receipt">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-outline w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadReceipt.isPending}
            >
              <Camera className="h-5 w-5" /> {uploadReceipt.isPending ? "Scanning…" : "Scan receipt"}
            </button>
          )}
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" className="btn-primary flex-1" onClick={() => submit(false)} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {!editing && (
          <button type="button" className="btn-outline flex-1" onClick={() => submit(true)} disabled={saving}>
            Save & add another
          </button>
        )}
      </div>
    </div>
  );
}
