"use client";

import { Search } from "lucide-react";
import type { Account, Category, TransactionFilters as Filters, TransactionType } from "@/lib/kosha/types";

const TYPE_OPTIONS: TransactionType[] = [
  "expense", "income", "transfer", "investment_buy", "investment_sell",
  "dividend", "interest", "loan_disbursal", "loan_payment", "tax_deducted", "tax_refund", "adjustment",
];

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  accounts: Account[];
  categories: Category[];
}

export function TransactionFiltersBar({ filters, onChange, accounts, categories }: Props) {
  const leafCategories = categories.filter((c) => c.parent_id);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value || undefined });
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="mb-4 space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          className="input pl-9"
          placeholder="Search payee or note…"
          value={filters.search ?? ""}
          onChange={(e) => set("search", e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <select className="select w-auto" value={filters.accountId ?? ""} onChange={(e) => set("accountId", e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon} {a.name}
            </option>
          ))}
        </select>
        <select className="select w-auto" value={filters.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value)}>
          <option value="">All categories</option>
          {leafCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
        <select
          className="select w-auto"
          value={filters.type ?? ""}
          onChange={(e) => set("type", e.target.value as TransactionType)}
        >
          <option value="">All types</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
        <input className="input w-auto" type="date" value={filters.dateFrom ?? ""} onChange={(e) => set("dateFrom", e.target.value)} />
        <input className="input w-auto" type="date" value={filters.dateTo ?? ""} onChange={(e) => set("dateTo", e.target.value)} />
        {hasFilters && (
          <button className="btn-ghost w-auto" onClick={() => onChange({})}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
