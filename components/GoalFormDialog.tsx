"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { useAccounts } from "@/lib/kosha/accounts";
import { useCreateGoal, useUpdateGoal } from "@/lib/kosha/goals";
import { rupeesToMinor, minorToRupees } from "@/lib/money";
import { errMessage } from "@/lib/errors";
import type { Goal, GoalSource } from "@/lib/kosha/types";

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Goal | null;
}

export function GoalFormDialog({ open, onClose, editing }: Props) {
  const isEdit = !!editing;
  const { data: accounts } = useAccounts();
  const create = useCreateGoal();
  const update = useUpdateGoal();

  const [name, setName] = useState(editing?.name ?? "");
  const [emoji, setEmoji] = useState(editing?.emoji ?? "🎯");
  const [target, setTarget] = useState(editing ? String(minorToRupees(editing.target_amount)) : "");
  const [source, setSource] = useState<GoalSource>(editing?.source ?? "account");
  const [accountId, setAccountId] = useState(editing?.account_id ?? "");
  const [tag, setTag] = useState(editing?.tag ?? "");
  const [targetDate, setTargetDate] = useState(editing?.target_date ?? "");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Give the goal a name");
    const targetNum = parseFloat(target);
    if (!targetNum || targetNum <= 0) return toast.error("Enter a target amount");
    if (source === "account" && !accountId) return toast.error("Choose the account you save into");
    if (source === "tag" && !tag.trim()) return toast.error("Enter the tag that marks deposits");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        emoji: emoji.trim() || "🎯",
        target_amount: rupeesToMinor(targetNum),
        source,
        account_id: source === "account" ? accountId : null,
        tag: source === "tag" ? tag.trim() : null,
        target_date: targetDate || null,
      };
      if (isEdit) {
        await update.mutateAsync({ id: editing!.id, patch: payload });
        toast.success("Goal updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Goal created");
      }
      onClose();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit goal" : "New savings goal"}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex gap-3">
          <div className="w-20">
            <label className="label">Emoji</label>
            <input className="input text-center text-xl" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} />
          </div>
          <div className="flex-1">
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Germany trip" autoFocus />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Target (₹)</label>
            <input className="input money" type="number" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="label">By (optional)</label>
            <input className="input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Progress counts from</label>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setSource("account")}
              className={`rounded-lg py-2 text-sm font-semibold transition ${source === "account" ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}
            >
              An account&apos;s balance
            </button>
            <button
              type="button"
              onClick={() => setSource("tag")}
              className={`rounded-lg py-2 text-sm font-semibold transition ${source === "tag" ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}
            >
              Tagged deposits
            </button>
          </div>
        </div>

        {source === "account" ? (
          <div>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Choose account…</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-text-muted">The account&apos;s balance is the goal&apos;s progress — ideal for a dedicated savings account.</p>
          </div>
        ) : (
          <div>
            <input className="input" placeholder="Tag, e.g. germany-fund" value={tag} onChange={(e) => setTag(e.target.value)} />
            <p className="mt-1.5 text-xs text-text-muted">
              Money you receive or transfer in with this tag counts toward the goal.
            </p>
          </div>
        )}

        <button className="btn-primary w-full" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create goal"}
        </button>
      </form>
    </Modal>
  );
}
