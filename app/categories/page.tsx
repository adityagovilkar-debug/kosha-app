"use client";

import { useState } from "react";
import { Plus, Pencil, Archive } from "lucide-react";
import { useCategories, groupCategories } from "@/lib/kosha/categories";
import { CategoryFormDialog } from "@/components/CategoryFormDialog";
import { CategoryArchiveDialog } from "@/components/CategoryArchiveDialog";
import { paletteColor } from "@/lib/palette";
import type { Category } from "@/lib/kosha/types";

export default function CategoriesPage() {
  const { data: categories, isLoading } = useCategories();
  const groups = groupCategories(categories ?? []);

  const [formOpen, setFormOpen] = useState(false);
  const [formEditing, setFormEditing] = useState<Category | null>(null);
  const [formParent, setFormParent] = useState<Category | null>(null);

  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null);
  const [archiveSiblings, setArchiveSiblings] = useState<Category[]>([]);

  function newGroup() {
    setFormEditing(null);
    setFormParent(null);
    setFormOpen(true);
  }
  function newChild(group: Category) {
    setFormEditing(null);
    setFormParent(group);
    setFormOpen(true);
  }
  function edit(cat: Category) {
    setFormEditing(cat);
    setFormParent(null);
    setFormOpen(true);
  }
  function askArchive(cat: Category, siblings: Category[]) {
    setArchiveTarget(cat);
    setArchiveSiblings(siblings);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
        <button className="btn-primary" onClick={newGroup}>
          <Plus className="h-5 w-5" /> New group
        </button>
      </div>

      {isLoading && <p className="text-text-muted">Loading…</p>}

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.id} className="card p-4">
            <div className="mb-2 flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
                style={{ backgroundColor: `${paletteColor(group.color)}26` }}
              >
                {group.emoji}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{group.name}</p>
                <p className="text-xs capitalize text-text-muted">{group.kind}</p>
              </div>
              <button className="btn-ghost !min-h-0 !p-2" onClick={() => edit(group)} aria-label="Edit group">
                <Pencil className="h-4 w-4" />
              </button>
              <button
                className="btn-ghost !min-h-0 !p-2 disabled:opacity-30"
                onClick={() => askArchive(group, [])}
                disabled={group.children.length > 0}
                title={group.children.length > 0 ? "Archive its categories first" : "Archive group"}
                aria-label="Archive group"
              >
                <Archive className="h-4 w-4" />
              </button>
            </div>

            <div className="ml-4 space-y-1 border-l pl-4" style={{ borderColor: "var(--border)" }}>
              {group.children.map((child) => (
                <div key={child.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-sm"
                    style={{ backgroundColor: `${paletteColor(child.color)}26` }}
                  >
                    {child.emoji}
                  </span>
                  <span className="flex-1 text-sm">{child.name}</span>
                  <button className="btn-ghost !min-h-0 !p-1.5" onClick={() => edit(child)} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="btn-ghost !min-h-0 !p-1.5"
                    onClick={() => askArchive(child, group.children)}
                    aria-label="Archive"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-400 hover:bg-surface-2"
                onClick={() => newChild(group)}
              >
                <Plus className="h-3.5 w-3.5" /> Add category
              </button>
            </div>
          </div>
        ))}
      </div>

      <CategoryFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={formEditing}
        parent={formParent}
      />
      <CategoryArchiveDialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        category={archiveTarget}
        siblings={archiveSiblings}
      />
    </div>
  );
}
