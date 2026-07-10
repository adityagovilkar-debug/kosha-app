// Extracts a human-readable message from anything thrown. Supabase's
// PostgrestError is a PLAIN OBJECT (not an Error instance) in this SDK
// version, so the common `err instanceof Error ? err.message : fallback`
// pattern silently discarded the real reason ("Could not find the
// 'base_amount' column…" became "Something went wrong"). Every catch block
// funnels through here instead.
export function errMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object") {
    const maybe = err as { message?: unknown; error_description?: unknown; hint?: unknown };
    if (typeof maybe.message === "string" && maybe.message) return maybe.message;
    if (typeof maybe.error_description === "string" && maybe.error_description) return maybe.error_description;
  }
  if (typeof err === "string" && err) return err;
  return fallback;
}
