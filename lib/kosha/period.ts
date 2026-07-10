import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  endOfYear,
  format,
} from "date-fns";

// The global Insights period switcher (KOSHA-PLAN.md §7). "FY" is the
// Indian financial year (Apr 1 – Mar 31).

export type PeriodKey = "this_month" | "last_month" | "3m" | "6m" | "ytd" | "fy" | "year" | "all" | "custom";

export interface Period {
  key: PeriodKey;
  label: string;
  from: string; // YYYY-MM-DD (inclusive)
  to: string; // YYYY-MM-DD (inclusive)
}

export const PERIOD_LABELS: { key: PeriodKey; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "fy", label: "FY" },
  { key: "year", label: "1Y" },
  { key: "all", label: "All" },
];

function iso(d: Date) {
  return format(d, "yyyy-MM-dd");
}

/** Indian financial year containing `d`: Apr 1 of the starting year to Mar 31. */
export function indianFY(d: Date): { from: Date; to: Date; startYear: number } {
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; // months are 0-based; Apr = 3
  return { from: new Date(year, 3, 1), to: new Date(year + 1, 2, 31), startYear: year };
}

export function resolvePeriod(key: PeriodKey, custom?: { from: string; to: string }): Period {
  const now = new Date();
  const label = PERIOD_LABELS.find((p) => p.key === key)?.label ?? "Custom";

  switch (key) {
    case "this_month":
      return { key, label, from: iso(startOfMonth(now)), to: iso(endOfMonth(now)) };
    case "last_month": {
      const m = subMonths(now, 1);
      return { key, label, from: iso(startOfMonth(m)), to: iso(endOfMonth(m)) };
    }
    case "3m":
      return { key, label, from: iso(startOfMonth(subMonths(now, 2))), to: iso(endOfMonth(now)) };
    case "6m":
      return { key, label, from: iso(startOfMonth(subMonths(now, 5))), to: iso(endOfMonth(now)) };
    case "ytd":
      return { key, label, from: iso(startOfYear(now)), to: iso(now) };
    case "fy": {
      const fy = indianFY(now);
      return { key, label: `FY${(fy.startYear % 100).toString().padStart(2, "0")}`, from: iso(fy.from), to: iso(fy.to) };
    }
    case "year":
      return { key, label, from: iso(subMonths(now, 12)), to: iso(now) };
    case "all":
      return { key, label, from: "2000-01-01", to: iso(now) };
    case "custom":
      return { key, label: "Custom", from: custom?.from ?? iso(startOfMonth(now)), to: custom?.to ?? iso(now) };
  }
}

/** Every month (YYYY-MM) touched by a period, oldest first — for monthly series. */
export function monthsInPeriod(period: Period): string[] {
  const months: string[] = [];
  let cursor = startOfMonth(new Date(period.from));
  const end = endOfMonth(new Date(period.to));
  while (cursor <= end) {
    months.push(format(cursor, "yyyy-MM"));
    cursor = startOfMonth(subMonths(cursor, -1));
  }
  return months;
}

export { startOfYear, endOfYear };
