"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Wand2, Trash2, Plus } from "lucide-react";
import { useCategories, groupCategories } from "@/lib/kosha/categories";
import { useCategoryRules, useCreateCategoryRule, useDeleteCategoryRule } from "@/lib/kosha/rules";
import { errMessage } from "@/lib/errors";

// "Payee contains X → category Y" rulebook. Applied automatically in
// Quick-Add (as you type a payee) and during CSV import.
export function CategoryRulesCard() {
  const { data: categories } = useCategories();
  const { data: rules } = useCategoryRules();
  const createRule = useCreateCategoryRule();
  const deleteRule = useDeleteCategoryRule();

  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);

  const categoriesById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const leafCategories = useMemo(
    () => groupCategories(categories ?? []).flatMap((g) => g.children),
    [categories],
  );

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!pattern.trim()) return toast.error("Enter some payee text to match");
    if (!categoryId) return toast.error("Pick a category");
    setSaving(true);
    try {
      await createRule.mutateAsync({ pattern: pattern.trim(), category_id: categoryId });
      setPattern("");
      toast.success("Rule added");
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card mt-6 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Wand2 className="h-5 w-5 text-brand-400" />
        <h2 className="text-lg font-bold">Auto-categorization</h2>
      </div>
      <p className="mb-4 text-sm text-text-muted">
        When a payee contains the text, the category is filled in for you — in Quick-Add and CSV imports. The
        most specific (longest) match wins.
      </p>

      <form onSubmit={onAdd} className="mb-3 flex gap-2">
        <input
          className="input min-w-0 flex-1"
          placeholder="Payee contains… e.g. Swiggy"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
        />
        <select className="select w-auto max-w-[40%]" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Category…</option>
          {leafCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
        <button className="btn-primary shrink-0 !min-h-0 !px-3" disabled={saving} aria-label="Add rule">
          <Plus className="h-4 w-4" />
        </button>
      </form>

      {(rules?.length ?? 0) === 0 ? (
        <p className="text-sm text-text-muted">No rules yet.</p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {(rules ?? []).map((r) => {
            const cat = categoriesById.get(r.category_id);
            return (
              <div key={r.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="rounded-lg bg-surface-2 px-2 py-0.5 font-mono text-xs">{r.pattern}</span>
                <span className="text-text-muted">→</span>
                <span className="flex-1 truncate">
                  {cat ? `${cat.emoji} ${cat.name}` : "(deleted category)"}
                </span>
                <button
                  className="btn-ghost !min-h-0 shrink-0 !p-1.5"
                  onClick={() => deleteRule.mutate(r.id)}
                  aria-label="Delete rule"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
