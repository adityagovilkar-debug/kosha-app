// Money utilities. Every amount is an integer number of minor units (paise
// for INR) — never a float. Formatting/parsing to rupees is a UI-only
// concern and lives entirely in this file.
//
// Amounts are kept as plain JS `number` (not BigInt): personal-finance
// paise values stay many orders of magnitude below Number.MAX_SAFE_INTEGER
// (2^53-1 ≈ 90 lakh crore rupees), so precision is never at risk in practice.

const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let f = CURRENCY_FORMATTERS.get(currency);
  if (!f) {
    // en-IN gives the lakh/crore (2-2-3) digit grouping for free.
    f = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    CURRENCY_FORMATTERS.set(currency, f);
  }
  return f;
}

/** Format minor units (paise) as a currency string, e.g. 12345678 -> "₹1,23,456.78". */
export function formatMoney(minorUnits: number, currency = "INR"): string {
  return formatter(currency).format(minorUnits / 100);
}

/** Format with an explicit sign, e.g. "+₹500.00" / "-₹120.00" (income/expense coloring). */
export function formatMoneySigned(minorUnits: number, currency = "INR"): string {
  const sign = minorUnits > 0 ? "+" : minorUnits < 0 ? "-" : "";
  return sign + formatMoney(Math.abs(minorUnits), currency);
}

/**
 * Compact money for chart axes/labels using Indian lakh/crore scale, e.g.
 * 12345678 (paise) -> "₹1.2L", 987654321 -> "₹98.8L", 1234567890 -> "₹12.3Cr".
 */
export function formatCompactINR(minorUnits: number): string {
  const rupees = Math.abs(minorUnits) / 100;
  const sign = minorUnits < 0 ? "-" : "";
  if (rupees >= 1e7) return `${sign}₹${(rupees / 1e7).toFixed(rupees >= 1e8 ? 0 : 1)}Cr`;
  if (rupees >= 1e5) return `${sign}₹${(rupees / 1e5).toFixed(rupees >= 1e6 ? 0 : 1)}L`;
  if (rupees >= 1e3) return `${sign}₹${(rupees / 1e3).toFixed(rupees >= 1e4 ? 0 : 1)}k`;
  return `${sign}₹${Math.round(rupees)}`;
}

/** Convert a rupee amount (float, as typed by a human) to integer paise. */
export function rupeesToMinor(rupees: number): number {
  return Math.round(rupees * 100);
}

export function minorToRupees(minorUnits: number): number {
  return minorUnits / 100;
}

/**
 * Parse the quick-add keypad buffer into integer paise. Supports simple
 * running addition, e.g. "120+80" -> 20000 paise (₹200), per the quick-add
 * spec (KOSHA-PLAN.md §5: "numeric, with + for quick arithmetic").
 * Returns null if the input doesn't parse to a valid non-negative amount.
 */
export function parseAmountInput(raw: string): number | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const parts = cleaned.split("+").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+(\.\d{1,2})?$/.test(p))) return null;
  const total = parts.reduce((sum, p) => sum + parseFloat(p), 0);
  if (!Number.isFinite(total) || total < 0) return null;
  return rupeesToMinor(total);
}
