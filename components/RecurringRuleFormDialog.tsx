"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { useAccounts } from "@/lib/kosha/accounts";
import { useCategories, groupCategories } from "@/lib/kosha/categories";
import { useCreateRecurringRule, useUpdateRecurringRule } from "@/lib/kosha/recurring";
import { rupeesToMinor, minorToRupees } from "@/lib/money";
import { paletteColor } from "@/lib/palette";
import type { AmountMode, CategoryKind, Frequency, RecurringRule, RecurringType } from "@/lib/kosha/types";

const TYPE_OPTIONS: { value: RecurringType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "daily", label: "day(s)" },
  { value: "weekly", label: "week(s)" },
  { value: "monthly", label: "month(s)" },
  { value: "quarterly", label: "quarter(s)" },
  { value: "yearly", label: "year(s)" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: RecurringRule | null;
}

export function RecurringRuleFormDialog({ open, onClose, editing }: Props) {
  const isEdit = !!editing;
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const create = useCreateRecurringRule();
  const update = useUpdateRecurringRule();

  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<RecurringType>(editing?.type ?? "expense");
  const [accountId, setAccountId] = useState(editing?.account_id ?? "");
  const [toAccountId, setToAccountId] = useState(editing?.to_account_id ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null);
  const [payee, setPayee] = useState(editing?.payee ?? "");
  const [amount, setAmount] = useState(editing ? String(minorToRupees(editing.amount)) : "");
  const [amountMode, setAmountMode] = useState<AmountMode>(editing?.amount_mode ?? "fixed");
  const [frequency, setFrequency] = useState<Frequency>(editing?.frequency ?? "monthly");
  const [interval, setInterval_] = useState(editing?.interval ?? 1);
  const [startDate, setStartDate] = useState(editing?.start_date ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(editing?.end_date ?? "");
  const [autoPost, setAutoPost] = useState(editing?.auto_post ?? false);
  const [note, setNote] = useState(editing?.note ?? "");
  const [saving, setSaving] = useState(false);

  const kindForType: CategoryKind = type === "income" ? "income" : "expense";
  const leafCategories = groupCategories(categories ?? [])
    .filter((g) => g.kind === kindForType)
    .flatMap((g) => g.children);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Give it a name");
    if (!accountId) return toast.error("Choose an account");
    if (type === "transfer" && (!toAccountId || toAccountId === accountId)) return toast.error("Pick a different destination account");
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) return toast.error("Enter an amount");

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        account_id: accountId,
        to_account_id: type === "transfer" ? toAccountId : null,
        type,
        category_id: type === "transfer" ? null : categoryId,
        payee: type === "transfer" ? null : payee || null,
        amount: rupeesToMinor(amountNum),
        note: note || null,
        frequency,
        interval,
        start_date: startDate,
        end_date: endDate || null,
        amount_mode: type === "transfer" ? "fixed" : amountMode,
        auto_post: autoPost,
      };
      if (isEdit) {
        await update.mutateAsync({ id: editing!.id, patch: payload });
        toast.success("Rule updated");
      } else {
        await create.mutateAsync({ ...payload, next_due: startDate });
        toast.success("Recurring rule created");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const activeAccounts = accounts ?? [];

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit recurring rule" : "New recurring rule"}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Netflix" autoFocus />
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={`rounded-lg py-2 text-sm font-semibold transition ${type === t.value ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {type === "transfer" ? (
          <div className="grid grid-cols-2 gap-2">
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">From…</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                </option>
              ))}
            </select>
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
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Choose account…</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                </option>
              ))}
            </select>
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
                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-base" style={{ backgroundColor: `${paletteColor(c.color)}26` }}>
                    {c.emoji}
                  </span>
                  <span className="w-full truncate text-center">{c.name}</span>
                </button>
              ))}
            </div>
            <input className="input" placeholder="Payee (optional)" value={payee} onChange={(e) => setPayee(e.target.value)} />
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount</label>
            <input className="input money" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {type !== "transfer" && (
            <div>
              <label className="label">Amount type</label>
              <select className="select" value={amountMode} onChange={(e) => setAmountMode(e.target.value as AmountMode)}>
                <option value="fixed">Fixed (subscriptions)</option>
                <option value="variable">Variable (utilities)</option>
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="label">Repeats every</label>
          <div className="flex gap-2">
            <input
              className="input w-20"
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval_(Math.max(1, parseInt(e.target.value) || 1))}
            />
            <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{isEdit ? "Started" : "First charge"}</label>
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={isEdit} />
          </div>
          <div>
            <label className="label">Ends (optional)</label>
            <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} className="h-4 w-4" />
          Post automatically (skip the confirm step)
        </label>

        <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

        <button className="btn-primary w-full" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create rule"}
        </button>
      </form>
    </Modal>
  );
}
