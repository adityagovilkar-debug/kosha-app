-- =====================================================================
-- Kosha — Phase 2: recurring rules + budgets
--
-- Shared Supabase project rules still apply (KOSHA-PLAN.md §2.1): additive
-- only, kosha_-prefixed objects, never touch anything belonging to Nudge.
--
-- Design notes:
--  * A recurring rule's `start_date` doubles as the schedule anchor — its
--    day-of-month / day-of-week IS the recurrence pattern, so there's no
--    separate day_of_month/weekday column. Stepping is done by repeatedly
--    adding `interval` units of `frequency` to the previous due date.
--  * `next_due` is the next occurrence NOT YET materialized into
--    kosha_transactions. Materialization (client-side, see
--    lib/kosha/recurring.ts) walks forward from next_due to today,
--    inserting one transaction per due date (status='pending' unless
--    auto_post), then advances next_due past today.
--  * Idempotency is enforced by checking (recurring_rule_id, date) pairs
--    already present in kosha_transactions before inserting — not solely
--    by trusting next_due — so re-running materialization is always safe.
--  * `last_confirmed_amount` powers the price-change badge: when the user
--    confirms a pending occurrence with a different amount, both
--    last_confirmed_amount and the rule's own `amount` are updated so
--    fixed-price rules "learn" price hikes and variable rules track the
--    latest value as next month's starting guess.
--  * Budgets target a single (leaf) category for v1 — no group rollup.
-- =====================================================================

alter table kosha_transactions
  add column if not exists recurring_rule_id uuid;

create table if not exists kosha_recurring_rules (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users on delete cascade,
  name                  text not null,
  account_id            uuid not null references kosha_accounts on delete cascade,
  to_account_id         uuid references kosha_accounts on delete cascade,  -- only for type='transfer'
  type                  text not null check (type in ('expense','income','transfer')),
  category_id           uuid references kosha_categories on delete set null,
  payee                 text,
  amount                bigint not null check (amount > 0),  -- positive magnitude; sign applied at materialization
  note                  text,
  frequency             text not null check (frequency in ('daily','weekly','monthly','quarterly','yearly')),
  interval              int not null default 1 check (interval > 0),
  start_date            date not null,
  end_date              date,
  next_due              date not null,
  amount_mode           text not null default 'fixed' check (amount_mode in ('fixed','variable')),
  auto_post             boolean not null default false,
  last_confirmed_amount bigint,
  archived              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_kosha_recurring_user      on kosha_recurring_rules(user_id);
create index if not exists idx_kosha_recurring_next_due  on kosha_recurring_rules(user_id, next_due) where not archived;

-- now that kosha_recurring_rules exists, wire up the FK + lookup index
alter table kosha_transactions
  add constraint kosha_transactions_recurring_rule_fk
  foreign key (recurring_rule_id) references kosha_recurring_rules on delete set null;

create index if not exists idx_kosha_tx_recurring on kosha_transactions(recurring_rule_id, date);

create table if not exists kosha_budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  category_id uuid not null references kosha_categories on delete cascade,
  amount      bigint not null check (amount > 0),
  period      text not null default 'monthly' check (period in ('monthly')),
  rollover    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, category_id)
);

create index if not exists idx_kosha_budgets_user on kosha_budgets(user_id);

drop trigger if exists trg_kosha_recurring_updated on kosha_recurring_rules;
create trigger trg_kosha_recurring_updated before update on kosha_recurring_rules
  for each row execute function kosha_set_updated_at();

drop trigger if exists trg_kosha_budgets_updated on kosha_budgets;
create trigger trg_kosha_budgets_updated before update on kosha_budgets
  for each row execute function kosha_set_updated_at();

alter table kosha_recurring_rules enable row level security;
alter table kosha_budgets         enable row level security;

drop policy if exists kosha_recurring_owner on kosha_recurring_rules;
create policy kosha_recurring_owner on kosha_recurring_rules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists kosha_budgets_owner on kosha_budgets;
create policy kosha_budgets_owner on kosha_budgets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
