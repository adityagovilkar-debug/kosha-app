-- =====================================================================
-- Kosha — Feature pack: auto-categorization rules, savings goals,
-- AMFI NAV auto-fetch.
--
-- REQUIRES 0003 and 0004 to be applied first (this alters kosha_holdings,
-- created in 0004). Shared-project rules still apply (KOSHA-PLAN.md §2.1):
-- additive only, kosha_-prefixed, idempotent, never touch Nudge objects.
--
-- Design notes:
--  * kosha_category_rules: "payee contains <pattern> → category". Matching
--    is client-side (case-insensitive substring, longest pattern wins) —
--    the table is just the user's rulebook. category_id cascades: deleting
--    a category deletes its rules; archiving keeps them (archived
--    categories still resolve for history).
--  * kosha_goals: progress is DERIVED, never stored. source='account'
--    reads the account's balance; source='tag' sums positive cleared
--    amounts carrying the tag (deposits toward the goal).
--  * kosha_holdings.amfi_code: the AMFI scheme code used to auto-fetch
--    mutual-fund NAVs from NAVAll.txt via the server route /api/nav.
-- =====================================================================

create table if not exists kosha_category_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  pattern     text not null,
  category_id uuid not null references kosha_categories on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists idx_kosha_rules_user on kosha_category_rules(user_id);

alter table kosha_category_rules enable row level security;
drop policy if exists kosha_rules_owner on kosha_category_rules;
create policy kosha_rules_owner on kosha_category_rules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists kosha_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  name          text not null,
  emoji         text not null default '🎯',
  target_amount bigint not null check (target_amount > 0),
  source        text not null check (source in ('account','tag')),
  account_id    uuid references kosha_accounts on delete cascade,
  tag           text,
  target_date   date,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_kosha_goals_user on kosha_goals(user_id);

drop trigger if exists trg_kosha_goals_updated on kosha_goals;
create trigger trg_kosha_goals_updated before update on kosha_goals
  for each row execute function kosha_set_updated_at();

alter table kosha_goals enable row level security;
drop policy if exists kosha_goals_owner on kosha_goals;
create policy kosha_goals_owner on kosha_goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- AMFI scheme code for NAV auto-fetch (mutual-fund holdings only).
alter table kosha_holdings
  add column if not exists amfi_code text;
