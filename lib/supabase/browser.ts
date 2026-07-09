"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// A single shared browser client instance for the whole app. Points at the
// SAME Supabase project as Nudge (see KOSHA-PLAN.md §2.1) — owner-only RLS
// on every kosha_* table keeps this safe to query directly from the client.
let client: SupabaseClient | undefined;

export function supabaseBrowser(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
