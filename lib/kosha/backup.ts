"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";

const sb = supabaseBrowser;

// Full JSON backup + restore (KOSHA-PLAN.md §9). Receipt images live in
// Storage, not the DB, so receipts are intentionally excluded — restored
// transactions simply lose their receipt link (set null). All other tables
// round-trip. On restore every row gets a fresh UUID with foreign keys
// remapped, so a backup can be loaded into any (ideally empty) account.

const BACKUP_VERSION = 3;

// Tables to export, in FK-safe insert order (parents before children).
const EXPORT_TABLES = [
  "kosha_accounts",
  "kosha_categories",
  "kosha_holdings",
  "kosha_recurring_rules",
  "kosha_budgets",
  "kosha_transactions",
  "kosha_holding_prices",
  "kosha_net_worth_snapshots",
] as const;

type Row = Record<string, unknown>;
export interface Backup {
  version: number;
  exportedAt: string;
  data: Record<string, Row[]>;
}

async function uid(): Promise<string> {
  const {
    data: { user },
  } = await sb().auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

export async function exportBackup(): Promise<Backup> {
  const data: Record<string, Row[]> = {};
  for (const table of EXPORT_TABLES) {
    const { data: rows, error } = await sb().from(table).select("*");
    if (error) throw error;
    data[table] = rows ?? [];
  }
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

export const LAST_BACKUP_KEY = "kosha-last-backup";

export async function downloadBackup() {
  const backup = await exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kosha-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch {}
}

/** Days since the last downloaded backup, or null if never. */
export function daysSinceBackup(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LAST_BACKUP_KEY);
  if (!raw) return null;
  return Math.floor((Date.now() - new Date(raw).getTime()) / 86_400_000);
}

function newIdMap(rows: Row[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) if (typeof r.id === "string") m.set(r.id, crypto.randomUUID());
  return m;
}

/** Order rows so self-referencing parents (null parent_id) insert first. */
function parentsFirst(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0));
}

export async function restoreBackup(backup: Backup): Promise<{ inserted: number }> {
  if (!backup?.data || typeof backup.version !== "number") throw new Error("That doesn't look like a Kosha backup file.");
  const user_id = await uid();
  const d = backup.data;

  const accountMap = newIdMap(d.kosha_accounts ?? []);
  const categoryMap = newIdMap(d.kosha_categories ?? []);
  const holdingMap = newIdMap(d.kosha_holdings ?? []);
  const ruleMap = newIdMap(d.kosha_recurring_rules ?? []);
  const txMap = newIdMap(d.kosha_transactions ?? []);
  const transferGroupMap = new Map<string, string>();
  const mapTransferGroup = (g: unknown) => {
    if (typeof g !== "string") return null;
    if (!transferGroupMap.has(g)) transferGroupMap.set(g, crypto.randomUUID());
    return transferGroupMap.get(g)!;
  };
  const remapId = (map: Map<string, string>, v: unknown) => (typeof v === "string" ? map.get(v) ?? null : null);

  let inserted = 0;
  const insert = async (table: string, rows: Row[]) => {
    if (rows.length === 0) return;
    // Supabase caps very large inserts; chunk to be safe.
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb().from(table).insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
    inserted += rows.length;
  };

  // 1. Accounts
  await insert(
    "kosha_accounts",
    (d.kosha_accounts ?? []).map((r) => ({ ...r, id: accountMap.get(r.id as string), user_id })),
  );

  // 2. Categories (parents first; remap self parent_id)
  await insert(
    "kosha_categories",
    parentsFirst(d.kosha_categories ?? []).map((r) => ({
      ...r,
      id: categoryMap.get(r.id as string),
      parent_id: r.parent_id ? remapId(categoryMap, r.parent_id) : null,
      user_id,
    })),
  );

  // 3. Holdings
  await insert(
    "kosha_holdings",
    (d.kosha_holdings ?? []).map((r) => ({ ...r, id: holdingMap.get(r.id as string), account_id: remapId(accountMap, r.account_id), user_id })),
  );

  // 4. Recurring rules
  await insert(
    "kosha_recurring_rules",
    (d.kosha_recurring_rules ?? []).map((r) => ({
      ...r,
      id: ruleMap.get(r.id as string),
      account_id: remapId(accountMap, r.account_id),
      to_account_id: r.to_account_id ? remapId(accountMap, r.to_account_id) : null,
      category_id: r.category_id ? remapId(categoryMap, r.category_id) : null,
      holding_id: r.holding_id ? remapId(holdingMap, r.holding_id) : null,
      user_id,
    })),
  );

  // 5. Budgets
  await insert(
    "kosha_budgets",
    (d.kosha_budgets ?? []).map((r) => ({ ...r, id: crypto.randomUUID(), category_id: remapId(categoryMap, r.category_id), user_id })),
  );

  // 6. Transactions (parents first; remap every FK; drop receipt link)
  await insert(
    "kosha_transactions",
    parentsFirst(d.kosha_transactions ?? []).map((r) => ({
      ...r,
      id: txMap.get(r.id as string),
      account_id: remapId(accountMap, r.account_id),
      category_id: r.category_id ? remapId(categoryMap, r.category_id) : null,
      parent_id: r.parent_id ? remapId(txMap, r.parent_id) : null,
      recurring_rule_id: r.recurring_rule_id ? remapId(ruleMap, r.recurring_rule_id) : null,
      holding_id: r.holding_id ? remapId(holdingMap, r.holding_id) : null,
      transfer_group_id: mapTransferGroup(r.transfer_group_id),
      receipt_id: null,
      user_id,
    })),
  );

  // 7. Holding prices (composite key, remap holding_id)
  await insert(
    "kosha_holding_prices",
    (d.kosha_holding_prices ?? []).map((r) => ({ ...r, holding_id: remapId(holdingMap, r.holding_id) })).filter((r) => r.holding_id),
  );

  // 8. Net-worth snapshots (remap account ids inside the breakdown jsonb)
  await insert(
    "kosha_net_worth_snapshots",
    (d.kosha_net_worth_snapshots ?? []).map((r) => {
      const breakdown = r.breakdown && typeof r.breakdown === "object" ? (r.breakdown as Record<string, number>) : null;
      const remappedBreakdown = breakdown
        ? Object.fromEntries(Object.entries(breakdown).map(([accId, v]) => [accountMap.get(accId) ?? accId, v]))
        : null;
      return { ...r, id: crypto.randomUUID(), breakdown: remappedBreakdown, user_id };
    }),
  );

  return { inserted };
}
