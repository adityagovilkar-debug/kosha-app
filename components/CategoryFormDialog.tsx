"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { useCreateCategory, useUpdateCategory } from "@/lib/kosha/categories";
import { PALETTE_KEYS, paletteColor } from "@/lib/palette";
import type { Category, CategoryKind } from "@/lib/kosha/types";
import { errMessage } from "@/lib/errors";

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Category | null;
  /** For creating a child category — the group it belongs to. */
  parent?: Category | null;
}

export function CategoryFormDialog({ open, onClose, editing, parent }: Props) {
  const isEdit = !!editing;
  const isChild = !!(editing?.parent_id || parent);
  const create = useCreateCategory();
  const update = useUpdateCategory();

  const [name, setName] = useState(editing?.name ?? "");
  const [emoji, setEmoji] = useState(editing?.emoji ?? "💸");
  const [color, setColor] = useState(editing?.color ?? "slate");
  const [kind, setKind] = useState<CategoryKind>(editing?.kind ?? parent?.kind ?? "expense");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Give it a name");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        emoji: emoji.trim() || "💸",
        color,
        kind: isChild ? (parent?.kind ?? editing?.kind ?? "expense") : kind,
        parent_id: isChild ? (parent?.id ?? editing?.parent_id ?? null) : null,
      };
      if (isEdit) {
        await update.mutateAsync({ id: editing!.id, patch: payload });
        toast.success("Category updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Category created");
      }
      onClose();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit category" : isChild ? `New category in ${parent?.name}` : "New category group"}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex gap-3">
          <div className="w-20">
            <label className="label">Emoji</label>
            <input className="input text-center text-xl" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} />
          </div>
          <div className="flex-1">
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Groceries" />
          </div>
        </div>

        {!isChild && (
          <div>
            <label className="label">Kind</label>
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as CategoryKind[]).map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-xl border py-2.5 text-sm font-semibold capitalize transition ${
                    kind === k ? "border-brand-500 bg-brand-500/10 text-text" : "text-text-muted hover:bg-surface-2"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="label">Color</label>
          <div className="flex flex-wrap gap-2">
            {PALETTE_KEYS.map((key) => (
              <button
                type="button"
                key={key}
                onClick={() => setColor(key)}
                className="h-8 w-8 rounded-full transition"
                style={{ backgroundColor: paletteColor(key), boxShadow: color === key ? `0 0 0 2px ${paletteColor(key)}` : undefined }}
                aria-label={key}
              />
            ))}
          </div>
        </div>

        <button className="btn-primary w-full" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create"}
        </button>
      </form>
    </Modal>
  );
}
