# Kosha

A personal finance app — log every expense and income, define subscriptions
and budgets, track investments, loans, and net worth, and see it all as rich
visualizations. Single user, owner-only, INR-first with multi-currency support.

Next.js 16 (App Router) · Supabase (Postgres + Auth + Storage) · Tailwind v4 ·
ECharts · installable PWA.

> **Note:** Kosha deliberately **shares its Supabase project with the Nudge
> app** — same `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. All
> of Kosha's tables are prefixed `kosha_`, so the two apps coexist without
> touching each other. See `../KOSHA-PLAN.md` §2.1.

## Local development

1. `cp .env.local.example .env.local` and fill in the values (see below).
2. `npm install`
3. Apply the migrations in `supabase/migrations/` (in order) via the Supabase
   SQL editor, if not already applied.
4. `npm run dev` → http://localhost:3050

## Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Same as Nudge's project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Same as Nudge's project |
| `NEXT_PUBLIC_SITE_URL` | optional | Informational; the app derives its origin at runtime |
| `KOSHA_ENCRYPTION_KEY` | **server only** | 32-byte hex; encrypts the receipt-scan API key at rest. Generate once: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. If it changes, saved API keys can no longer be decrypted. |

## Deploying to Vercel

1. **Import** the GitHub repo (`adityagovilkar-debug/kosha-app`) into Vercel. It
   auto-detects Next.js — no build config needed.
2. **Set the environment variables** above in Vercel → Project → Settings →
   Environment Variables (Production + Preview). Mark `KOSHA_ENCRYPTION_KEY` as a
   plain env var — it is only read server-side and never shipped to the browser.
3. **Deploy.** You'll get a URL like `https://kosha-app.vercel.app`.
4. **Allow the auth redirect in Supabase** (one-time, or the magic-link / signup
   confirmation will bounce): Supabase dashboard → Authentication → URL
   Configuration →
   - **Site URL:** your Vercel URL.
   - **Redirect URLs:** add `https://<your-vercel-domain>/auth/callback`
     (keep `http://localhost:3050/auth/callback` too for local dev).
5. Open the URL, sign in with your existing (Nudge) account, and everything
   works — the app derives its own origin, so no code change is needed per domain.

## Installing on your phone

Once deployed over HTTPS, Kosha is an installable PWA:

- **Android / Chrome:** open the site → menu → **Install app** (or "Add to Home
  screen").
- **iOS / Safari:** open the site → Share → **Add to Home Screen**.

It then launches full-screen like a native app. Recent data is cached for
offline reading, and expenses logged offline are queued and synced when you
reconnect.

## Migrations

SQL migrations live in `supabase/migrations/` and are applied manually against
the shared Supabase project (SQL editor or CLI). They are **additive and
idempotent** — safe to re-run, and they never touch Nudge's objects.

| File | Phase |
|---|---|
| `0001_kosha_init.sql` | Core ledger: accounts, categories, transactions |
| `0002_kosha_recurring_budgets.sql` | Recurring rules + budgets |
| `0003_kosha_currency_receipts.sql` | FX rates, receipts, settings, storage bucket |
| `0004_kosha_wealth.sql` | Holdings, prices, net-worth snapshots, loan/tax columns |
