-- =====================================================================
-- Kosha — Phase 3: multi-currency + receipt scanning
--
-- Shared Supabase project rules still apply (KOSHA-PLAN.md §2.1): additive
-- only, kosha_-prefixed objects, never touch anything belonging to Nudge.
-- Every statement here is written to be safely re-runnable (lesson from
-- migration 0002 — Postgres has no ADD CONSTRAINT IF NOT EXISTS).
--
-- Design notes:
--  * kosha_fx_rates is shared reference data, not per-user — exchange
--    rates aren't private, so there's no user_id column. Any authenticated
--    user of this project may read/write the cache.
--  * kosha_settings holds one row per user (id = auth.uid()) for
--    account-level config. The Anthropic API key is stored as ciphertext
--    (AES-256-GCM, encrypted server-side in the API route — see
--    lib/server/crypto.ts) — the anon key can still only reach it through
--    RLS-scoped owner access, and only the API route holds the decryption
--    secret, so the plaintext key never reaches the client bundle.
--  * kosha_receipts: one row per uploaded photo. `extracted` holds the
--    Claude-vision JSON (merchant/date/total/currency/line_items); amounts
--    inside it are converted to integer minor units immediately on receipt
--    by the API route, never left as floats.
--  * kosha_transactions gains original_currency/original_amount/fx_rate
--    for foreign-currency purchases (amount stays the account-currency
--    value, as it always has) and receipt_id linking back to the photo.
-- =====================================================================

create table if not exists kosha_fx_rates (
  date         date not null,
  currency     text not null,
  rate_to_inr  numeric(18,8) not null,
  fetched_at   timestamptz not null default now(),
  primary key (date, currency)
);

alter table kosha_fx_rates enable row level security;

drop policy if exists kosha_fx_rates_shared_read on kosha_fx_rates;
create policy kosha_fx_rates_shared_read on kosha_fx_rates
  for select using (auth.uid() is not null);

drop policy if exists kosha_fx_rates_shared_write on kosha_fx_rates;
create policy kosha_fx_rates_shared_write on kosha_fx_rates
  for insert with check (auth.uid() is not null);

create table if not exists kosha_receipts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  storage_path text not null,
  ocr_status   text not null default 'pending' check (ocr_status in ('pending','done','failed')),
  extracted    jsonb,
  error        text,
  uploaded_at  timestamptz not null default now()
);

create index if not exists idx_kosha_receipts_user on kosha_receipts(user_id);

alter table kosha_receipts enable row level security;

drop policy if exists kosha_receipts_owner on kosha_receipts;
create policy kosha_receipts_owner on kosha_receipts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists kosha_settings (
  id                          uuid primary key references auth.users on delete cascade,
  anthropic_api_key_encrypted text,
  updated_at                  timestamptz not null default now()
);

alter table kosha_settings enable row level security;

drop policy if exists kosha_settings_owner on kosha_settings;
create policy kosha_settings_owner on kosha_settings
  for all using (id = auth.uid()) with check (id = auth.uid());

drop trigger if exists trg_kosha_settings_updated on kosha_settings;
create trigger trg_kosha_settings_updated before update on kosha_settings
  for each row execute function kosha_set_updated_at();

-- ---------------------------------------------------------------------
-- kosha_transactions additions
-- ---------------------------------------------------------------------
alter table kosha_transactions
  add column if not exists original_currency text,
  add column if not exists original_amount   bigint,
  add column if not exists fx_rate           numeric(18,8),
  add column if not exists base_amount       bigint,
  add column if not exists receipt_id        uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kosha_transactions_receipt_fk'
  ) then
    alter table kosha_transactions
      add constraint kosha_transactions_receipt_fk
      foreign key (receipt_id) references kosha_receipts on delete set null;
  end if;
end $$;

create index if not exists idx_kosha_tx_receipt on kosha_transactions(receipt_id);

-- ---------------------------------------------------------------------
-- Storage bucket for receipt photos — private, RLS-scoped by the
-- uploading user's folder (kosha-receipts/<user_id>/<file>).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('kosha-receipts', 'kosha-receipts', false)
on conflict (id) do nothing;

drop policy if exists kosha_receipts_storage_owner on storage.objects;
create policy kosha_receipts_storage_owner on storage.objects
  for all
  using (bucket_id = 'kosha-receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'kosha-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
