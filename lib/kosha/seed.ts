import type { SupabaseClient } from "@supabase/supabase-js";
import { paletteAt } from "@/lib/palette";
import type { CategoryKind } from "./types";

// Sensible Indian-household defaults (KOSHA-PLAN.md §3.2). Fully editable
// afterwards — this only seeds the very first screen so it isn't empty.
const DEFAULT_GROUPS: {
  name: string;
  emoji: string;
  kind: CategoryKind;
  children: { name: string; emoji: string }[];
}[] = [
  {
    name: "Living", emoji: "🏡", kind: "expense",
    children: [
      { name: "Groceries", emoji: "🛒" },
      { name: "Dining", emoji: "🍽️" },
      { name: "Household", emoji: "🧺" },
    ],
  },
  {
    name: "Transport", emoji: "🚗", kind: "expense",
    children: [
      { name: "Fuel", emoji: "⛽" },
      { name: "Public Transport", emoji: "🚌" },
      { name: "Ride-hailing", emoji: "🚕" },
    ],
  },
  {
    name: "Housing", emoji: "🏠", kind: "expense",
    children: [
      { name: "Rent / Maintenance", emoji: "🏠" },
      { name: "Utilities", emoji: "💡" },
      { name: "Mobile / Internet", emoji: "📶" },
    ],
  },
  {
    name: "Subscriptions", emoji: "📺", kind: "expense",
    children: [
      { name: "Streaming", emoji: "📺" },
      { name: "Software", emoji: "🧩" },
    ],
  },
  {
    name: "Health & Care", emoji: "🩺", kind: "expense",
    children: [
      { name: "Health", emoji: "🩺" },
      { name: "Insurance", emoji: "🛡️" },
    ],
  },
  {
    name: "Lifestyle", emoji: "🎬", kind: "expense",
    children: [
      { name: "Entertainment", emoji: "🎬" },
      { name: "Travel", emoji: "✈️" },
      { name: "Shopping", emoji: "🛍️" },
      { name: "Gifts", emoji: "🎁" },
    ],
  },
  {
    name: "Family & Education", emoji: "👨‍👩‍👧", kind: "expense",
    children: [
      { name: "Family", emoji: "👨‍👩‍👧" },
      { name: "Education", emoji: "📚" },
    ],
  },
  {
    name: "Taxes", emoji: "🧾", kind: "expense",
    children: [{ name: "Taxes", emoji: "🧾" }],
  },
  {
    name: "Income", emoji: "💼", kind: "income",
    children: [
      { name: "Salary", emoji: "💼" },
      { name: "Freelance", emoji: "🧑‍💻" },
      { name: "Interest", emoji: "🏦" },
      { name: "Dividends", emoji: "📈" },
      { name: "Tax Refund", emoji: "💸" },
      { name: "Other Income", emoji: "➕" },
    ],
  },
];

/**
 * If the user has no Kosha categories yet, seed the defaults above. Safe to
 * call on every dashboard load — it's a no-op once categories exist.
 */
export async function ensureDefaultCategories(supabase: SupabaseClient, userId: string) {
  const { count, error: countError } = await supabase
    .from("kosha_categories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) throw countError;
  if (count && count > 0) return;

  let colorIndex = 0;
  for (const group of DEFAULT_GROUPS) {
    const { data: parent, error: groupError } = await supabase
      .from("kosha_categories")
      .insert({
        user_id: userId,
        name: group.name,
        emoji: group.emoji,
        kind: group.kind,
        color: paletteAt(colorIndex++),
        sort_order: colorIndex,
      })
      .select()
      .single();
    if (groupError) throw groupError;

    const children = group.children.map((c, i) => ({
      user_id: userId,
      parent_id: parent.id,
      name: c.name,
      emoji: c.emoji,
      kind: group.kind,
      color: paletteAt(colorIndex++),
      sort_order: i,
    }));
    if (children.length) {
      const { error: childError } = await supabase.from("kosha_categories").insert(children);
      if (childError) throw childError;
    }
  }
}
