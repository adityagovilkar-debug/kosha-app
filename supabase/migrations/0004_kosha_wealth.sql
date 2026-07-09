-- =====================================================================
-- Kosha — Phase 4: investments, loans, net worth
--
-- Shared Supabase project rules still apply (KOSHA-PLAN.md §2.1): additive
-- only, kosha_-prefixed objects, never touch anything belonging to Nudge.
-- Every statement is written to be safely re-runnable (Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS — lesson from migration 0002).
--
-- Design notes:
--  * kosha_holding_prices.price and kosha_transactions.unit_price are
--    DECIMAL RUPEES, not minor units — a documented, deliberate exception
--    to the "money is always integer minor units" rule. Fund NAVs need
--    4 decimal places (₹45.6789); paise (2dp) would truncate them. Total
--    transaction amounts (qty × unit_price, rounded) still land in
--    kosha_transactions.amount as integer paise as always.
--  * kosha_holdings has no direct user_id-scoped RLS shortcut on
--    kosha_holding_prices (it has no user_id column) — ownership is
--    checked by joining through the parent holding.
--  * Loan accounts already carry loan_principal/interest_rate_pct/
--    emi_amount/tenure_months/loan_start_date from Phase 1 (unused until
--    now) — the amortization engine (lib/kosha/loans.ts) is pure
--    client-side math over those fields plus posted loan_payment rows.
--  * net_worth_snapshots is written once per calendar day on app load
--    (same idempotent daily pattern as recurring materialization).
-- =====================================================================

create table if not exists kosha_holdings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  account_id    uuid not null references kosha_accounts on delete cascade,
  name          text not null,
  asset_class   text not null check (asset_class in ('equity_mf','debt_mf','stock','epf_ppf','gold','fd','crypto','other')),
  units_tracked boolean not null default true,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_kosha_holdings_user on kosha_holdings(user_id);

drop trigger if exists trg_kosha_holdings_updated on kosha_holdings;
create trigger trg_kosha_holdings_updated before update on kosha_holdings
  for each row execute function kosha_set_updated_at();

alter table kosha_holdings enable row level security;
drop policy if exists kosha_holdings_owner on kosha_holdings;
create policy kosha_holdings_owner on kosha_holdings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists kosha_holding_prices (
  holding_id uuid not null references kosha_holdings on delete cascade,
  date       date not null,
  price      numeric(18,6) not null,
  primary key (holding_id, date)
);

alter table kosha_holding_prices enable row level security;
drop policy if exists kosha_holding_prices_owner on kosha_holding_prices;
create policy kosha_holding_prices_owner on kosha_holding_prices
  for all using (
    exists (select 1 from kosha_holdings h where h.id = holding_id and h.user_id = auth.uid())
  ) with check (
    exists (select 1 from kosha_holdings h where h.id = holding_id and h.user_id = auth.uid())
  );

create table if not exists kosha_net_worth_snapshots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  date              date not null,
  total_assets      bigint not null,
  total_liabilities bigint not null,
  breakdown         jsonb,
  created_at        timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists idx_kosha_networth_user on kosha_net_worth_snapshots(user_id, date);

alter table kosha_net_worth_snapshots enable row level security;
drop policy if exists kosha_networth_owner on kosha_net_worth_snapshots;
create policy kosha_networth_owner on kosha_net_worth_snapshots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- kosha_transactions additions
-- ---------------------------------------------------------------------
alter table kosha_transactions
  add column if not exists qty                 numeric(18,6),
  add column if not exists unit_price           numeric(18,6),  -- rupees, not minor units (see notes above)
  add column if not exists principal_component  bigint,
  add column if not exists interest_component   bigint,
  add column if not exists gross_amount         bigint,
  add column if not exists tds_amount           bigint,
  add column if not exists holding_id           uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kosha_transactions_holding_fk'
  ) then
    alter table kosha_transactions
      add constraint kosha_transactions_holding_fk
      foreign key (holding_id) references kosha_holdings on delete set null;
  end if;
end $$;

create index if not exists idx_kosha_tx_holding on kosha_transactions(holding_id, date);

-- ---------------------------------------------------------------------
-- kosha_recurring_rules: SIPs are recurring rules of type 'investment_buy'
-- (KOSHA-PLAN.md §6.2) — widen the type check and link to a holding.
-- Drop-then-recreate is idempotent on its own (no do-block needed): the
-- second run just drops what the first run added and adds it back.
-- ---------------------------------------------------------------------
alter table kosha_recurring_rules drop constraint if exists kosha_recurring_rules_type_check;
alter table kosha_recurring_rules add constraint kosha_recurring_rules_type_check
  check (type in ('expense','income','transfer','investment_buy'));

alter table kosha_recurring_rules
  add column if not exists holding_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kosha_recurring_rules_holding_fk'
  ) then
    alter table kosha_recurring_rules
      add constraint kosha_recurring_rules_holding_fk
      foreign key (holding_id) references kosha_holdings on delete set null;
  end if;
end $$;
