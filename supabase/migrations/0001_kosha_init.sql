-- =====================================================================
-- Kosha — initial schema (Phase 1: core ledger)
--
-- IMPORTANT — shared Supabase project: this migration runs against the
-- SAME Supabase project as the Nudge app (see KOSHA-PLAN.md §2.1). Every
-- object created here is prefixed `kosha_` and this migration is purely
-- additive — it must never alter, drop, or rename anything belonging to
-- Nudge (profiles, categories, errands, checklist_items, or their
-- triggers/functions). Auth is shared: rows are scoped by the same
-- auth.uid() the user already has from Nudge.
--
-- Design notes:
--  * Owner-only RLS everywhere: user_id = auth.uid() on every table.
--  * Money is bigint minor units (paise). Never floats.
--  * This table shape covers Phase 1 only (accounts, categories,
--    transactions incl. transfers + splits). Columns for later phases
--    (recurring_rule_id, receipt_id, multi-currency fields, tax fields,
--    loan-payment split, investment qty/price) are added by later
--    migrations via ALTER TABLE when the phase that needs them lands —
--    they are deliberately NOT pre-created here.
--  * Account balances are derived (opening_balance + sum of its
--    transactions), computed client-side. No cached balance column yet
--    (see KOSHA-PLAN.md §3.1 — fine to add later for performance).
-- =====================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid() — idempotent, safe even if Nudge already enabled it

-- ---------------------------------------------------------------------
-- kosha_accounts — where money lives (bank, cash, credit card, wallet,
-- investment, loan, other). Loan-specific fields are included now since
-- they're self-contained scalars with no cross-table dependency, even
-- though the amortization UI itself doesn't land until Phase 4.
-- ---------------------------------------------------------------------
create table if not exists kosha_accounts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  name              text not null,
  kind              text not null check (kind in ('bank','cash','credit_card','investment','loan','wallet','other')),
  currency          text not null default 'INR',
  opening_balance   bigint not null default 0,   -- minor units
  opening_date      date not null default current_date,
  color             text not null default 'violet',  -- key into the Kosha palette
  icon              text not null default '💰',       -- emoji
  archived          boolean not null default false,
  -- loan-only fields (null for every other kind)
  loan_principal      bigint,
  interest_rate_pct   numeric(6,3),
  emi_amount          bigint,
  tenure_months       int,
  loan_start_date     date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_kosha_accounts_user on kosha_accounts(user_id);

-- ---------------------------------------------------------------------
-- kosha_categories — two-level hierarchy (parent_id null = group).
-- ---------------------------------------------------------------------
create table if not exists kosha_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  parent_id   uuid references kosha_categories on delete cascade,
  name        text not null,
  emoji       text not null default '💸',
  color       text not null default 'slate',  -- key into the Kosha palette
  kind        text not null check (kind in ('expense','income','transfer_like')),
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_kosha_categories_user   on kosha_categories(user_id);
create index if not exists idx_kosha_categories_parent on kosha_categories(parent_id);

-- ---------------------------------------------------------------------
-- kosha_transactions — the ledger. One row per event, signed amount in
-- the owning account's currency. Transfers are two linked rows sharing
-- transfer_group_id; splits are child rows sharing parent_id.
-- ---------------------------------------------------------------------
create table if not exists kosha_transactions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  account_id         uuid not null references kosha_accounts on delete cascade,
  category_id        uuid references kosha_categories on delete set null,
  date               date not null default current_date,
  amount             bigint not null,   -- signed, minor units, account currency
  type               text not null check (type in (
                        'expense','income','transfer','investment_buy','investment_sell',
                        'dividend','interest','loan_disbursal','loan_payment',
                        'tax_deducted','tax_refund','adjustment'
                      )),
  payee              text,
  note               text,
  tags               text[] not null default '{}',
  status             text not null default 'cleared' check (status in ('cleared','pending')),
  transfer_group_id  uuid,   -- links the two legs of a transfer
  parent_id          uuid references kosha_transactions on delete cascade,  -- split children
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_kosha_tx_user           on kosha_transactions(user_id);
create index if not exists idx_kosha_tx_account_date    on kosha_transactions(account_id, date desc);
create index if not exists idx_kosha_tx_user_date       on kosha_transactions(user_id, date desc);
create index if not exists idx_kosha_tx_category        on kosha_transactions(category_id);
create index if not exists idx_kosha_tx_transfer_group  on kosha_transactions(transfer_group_id);
create index if not exists idx_kosha_tx_parent          on kosha_transactions(parent_id);

-- keep updated_at fresh (Kosha's own copy of the helper — deliberately not
-- reusing Nudge's set_updated_at() to keep the two apps fully decoupled)
create or replace function kosha_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_kosha_accounts_updated on kosha_accounts;
create trigger trg_kosha_accounts_updated before update on kosha_accounts
  for each row execute function kosha_set_updated_at();

drop trigger if exists trg_kosha_categories_updated on kosha_categories;
create trigger trg_kosha_categories_updated before update on kosha_categories
  for each row execute function kosha_set_updated_at();

drop trigger if exists trg_kosha_tx_updated on kosha_transactions;
create trigger trg_kosha_tx_updated before update on kosha_transactions
  for each row execute function kosha_set_updated_at();

-- =====================================================================
-- Row Level Security — strictly owner-only on every Kosha table.
-- =====================================================================
alter table kosha_accounts     enable row level security;
alter table kosha_categories   enable row level security;
alter table kosha_transactions enable row level security;

drop policy if exists kosha_accounts_owner on kosha_accounts;
create policy kosha_accounts_owner on kosha_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists kosha_categories_owner on kosha_categories;
create policy kosha_categories_owner on kosha_categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists kosha_transactions_owner on kosha_transactions;
create policy kosha_transactions_owner on kosha_transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
