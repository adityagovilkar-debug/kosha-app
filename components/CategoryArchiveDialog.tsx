"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { useArchiveCategory } from "@/lib/kosha/categories";
import type { Category } from "@/lib/kosha/types";
import { errMessage } from "@/lib/errors";

interface Props {
  open: boolean;
  onClose: () => void;
  category: Category | null;
  /** Sibling leaf categories of the same kind, for the reassignment picker. */
  siblings: Category[];
}

// Deleting a category never silently orphans transactions (KOSHA-PLAN.md
// principle #4) — this always offers to reassign first.
export function CategoryArchiveDialog({ open, onClose, category, siblings }: Props) {
  const archive = useArchiveCategory();
  const [reassignTo, setReassignTo] = useState<string>("");
  const [saving, setSaving] = useState(false);

  if (!category) return null;

  async function onConfirm() {
    setSaving(true);
    try {
      const count = await archive.mutateAsync({ id: category!.id, reassignToId: reassignTo || null });
      toast.success(count > 0 ? `Archived — ${count} transaction(s) reassigned` : "Category archived");
      onClose();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Archive "${category.name}"?`}>
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          Archived categories are hidden but never deleted, and any transactions using it stay intact. If
          you&apos;d rather move its existing transactions somewhere else first, pick a category below.
        </p>
        <div>
          <label className="label">Reassign existing transactions to</label>
          <select className="select" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
            <option value="">Leave uncategorized</option>
            {siblings
              .filter((s) => s.id !== category.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji} {s.name}
                </option>
              ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline flex-1" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-danger flex-1" onClick={onConfirm} disabled={saving}>
            {saving ? "Archiving…" : "Archive"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
