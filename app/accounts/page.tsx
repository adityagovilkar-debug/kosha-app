"use client";

import { useState } from "react";
import { Plus, Archive, Pencil } from "lucide-react";
import { useAccounts, useAccountBalances, useArchiveAccount } from "@/lib/kosha/accounts";
import { AccountFormDialog } from "@/components/AccountFormDialog";
import { formatMoney } from "@/lib/money";
import { paletteColor } from "@/lib/palette";
import type { Account } from "@/lib/kosha/types";

export default function AccountsPage() {
  const { data: accounts, isLoading } = useAccounts();
  const { data: balances } = useAccountBalances();
  const archiveAccount = useArchiveAccount();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(a: Account) {
    setEditing(a);
    setDialogOpen(true);
  }

  const totalNetWorth = (accounts ?? []).reduce((sum, a) => {
    const balance = a.opening_balance + (balances?.[a.id] ?? 0);
    return sum + balance;
  }, 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
          <p className="money mt-1 text-lg font-semibold text-text-muted">
            Net worth <span className="text-text">{formatMoney(totalNetWorth)}</span>
          </p>
        </div>
        <button className="btn-primary" onClick={openNew}>
          <Plus className="h-5 w-5" /> Add
        </button>
      </div>

      {isLoading && <p className="text-text-muted">Loading…</p>}

      {!isLoading && (accounts?.length ?? 0) === 0 && (
        <div className="card p-8 text-center text-text-muted">
          <p className="text-lg font-semibold text-text">No accounts yet</p>
          <p className="mt-1">Add your bank, cash, or wallet to start logging transactions.</p>
        </div>
      )}

      <div className="space-y-3">
        {(accounts ?? []).map((a) => {
          const balance = a.opening_balance + (balances?.[a.id] ?? 0);
          return (
            <div key={a.id} className="card flex items-center gap-4 p-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl"
                style={{ backgroundColor: `${paletteColor(a.color)}26` }}
              >
                {a.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{a.name}</p>
                <p className="text-sm capitalize text-text-muted">{a.kind.replace("_", " ")} · {a.currency}</p>
              </div>
              <div className="text-right">
                <p className={`money text-lg font-bold ${balance < 0 ? "text-expense" : "text-text"}`}>
                  {formatMoney(balance, a.currency)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button className="btn-ghost !min-h-0 !p-2" onClick={() => openEdit(a)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  className="btn-ghost !min-h-0 !p-2"
                  onClick={() => archiveAccount.mutate({ id: a.id, archived: true })}
                  aria-label="Archive"
                >
                  <Archive className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <AccountFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} account={editing} />
    </div>
  );
}
