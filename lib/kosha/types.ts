// TypeScript mirror of the Phase 1 schema (supabase/migrations/0001_kosha_init.sql).

export type AccountKind = "bank" | "cash" | "credit_card" | "investment" | "loan" | "wallet" | "other";

export interface Account {
  id: string;
  user_id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  opening_balance: number; // minor units
  opening_date: string; // YYYY-MM-DD
  color: string;
  icon: string;
  archived: boolean;
  loan_principal: number | null;
  interest_rate_pct: number | null;
  emi_amount: number | null;
  tenure_months: number | null;
  loan_start_date: string | null;
  created_at: string;
  updated_at: string;
}

export type NewAccount = Pick<Account, "name" | "kind" | "currency" | "opening_balance" | "opening_date" | "color" | "icon"> &
  Partial<Pick<Account, "loan_principal" | "interest_rate_pct" | "emi_amount" | "tenure_months" | "loan_start_date">>;

export type CategoryKind = "expense" | "income" | "transfer_like";

export interface Category {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  emoji: string;
  color: string;
  kind: CategoryKind;
  sort_order: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export type NewCategory = Pick<Category, "name" | "emoji" | "color" | "kind"> &
  Partial<Pick<Category, "parent_id" | "sort_order">>;

/** A category group with its child categories attached (client-side shape). */
export interface CategoryGroup extends Category {
  children: Category[];
}

export type TransactionType =
  | "expense"
  | "income"
  | "transfer"
  | "investment_buy"
  | "investment_sell"
  | "dividend"
  | "interest"
  | "loan_disbursal"
  | "loan_payment"
  | "tax_deducted"
  | "tax_refund"
  | "adjustment";

export type TransactionStatus = "cleared" | "pending";

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  date: string; // YYYY-MM-DD
  amount: number; // signed, minor units, account currency
  type: TransactionType;
  payee: string | null;
  note: string | null;
  tags: string[];
  status: TransactionStatus;
  transfer_group_id: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export type NewTransaction = Pick<Transaction, "account_id" | "date" | "amount" | "type"> &
  Partial<Pick<Transaction, "category_id" | "payee" | "note" | "tags" | "status" | "transfer_group_id" | "parent_id">>;

export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  tag?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}
