"use client";

import { useState } from "react";
import { ChevronDown, ArrowRightLeft, Trash2 } from "lucide-react";
import { formatMoneySigned } from "@/lib/money";
import { paletteColor } from "@/lib/palette";
import { useSplitChildren } from "@/lib/kosha/transactions";
import type { Account, Category, Transaction } from "@/lib/kosha/types";

interface Props {
  tx: Transaction;
  account?: Account;
  category?: Category;
  categoriesById: Map<string, Category>;
  onEdit: (tx: Transaction) => void;
  onDelete?: (tx: Transaction) => void;
  isSplitParent: boolean;
}

export function TransactionRow({ tx, account, category, categoriesById, onEdit, onDelete, isSplitParent }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { data: children } = useSplitChildren(expanded ? tx.id : null);
  const isTransfer = tx.type === "transfer";
  const editable = !isTransfer && !isSplitParent;

  const amountClass = isTransfer ? "text-text" : tx.amount < 0 ? "text-expense" : "text-income";

  return (
    <div className="rounded-xl hover:bg-surface-2">
      <div
        className="flex cursor-pointer items-center gap-3 px-3 py-2.5"
        onClick={() => (isSplitParent ? setExpanded((v) => !v) : editable && onEdit(tx))}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
          style={{ backgroundColor: `${paletteColor(category?.color)}26` }}
        >
          {isTransfer ? <ArrowRightLeft className="h-5 w-5 text-text-muted" /> : category?.emoji ?? (isSplitParent ? "🧾" : "💸")}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {isTransfer ? "Transfer" : tx.payee || category?.name || (isSplitParent ? "Split transaction" : "Uncategorized")}
          </p>
          <p className="truncate text-xs text-text-muted">
            {account?.name}
            {!isTransfer && category && ` · ${category.name}`}
            {tx.note && ` · ${tx.note}`}
          </p>
        </div>
        <p className={`money shrink-0 text-sm font-bold ${amountClass}`}>{formatMoneySigned(tx.amount, account?.currency)}</p>
        {isSplitParent && <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition ${expanded ? "rotate-180" : ""}`} />}
        {onDelete && (
          <button
            className="btn-ghost !min-h-0 shrink-0 !p-1.5"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(tx);
            }}
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isSplitParent && expanded && (
        <div className="ml-12 space-y-1 border-l pb-2 pl-3" style={{ borderColor: "var(--border)" }}>
          {(children ?? []).map((child) => {
            const childCat = child.category_id ? categoriesById.get(child.category_id) : undefined;
            return (
              <div key={child.id} className="flex items-center gap-2 py-1 text-sm">
                <span>{childCat?.emoji ?? "💸"}</span>
                <span className="flex-1 truncate text-text-muted">{childCat?.name ?? "Uncategorized"}</span>
                <span className="money font-semibold">{formatMoneySigned(child.amount, account?.currency)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
