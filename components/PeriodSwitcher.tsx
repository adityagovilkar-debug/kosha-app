"use client";

import { PERIOD_LABELS, type PeriodKey } from "@/lib/kosha/period";

interface Props {
  value: PeriodKey;
  onChange: (key: PeriodKey) => void;
}

// Horizontal scrollable segmented control. Consistent across every Insights
// chart (KOSHA-PLAN.md §7 — "period switcher consistent across all").
export function PeriodSwitcher({ value, onChange }: Props) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
      {PERIOD_LABELS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            value === p.key ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export type { PeriodKey };
