"use client";

import { formatMoney } from "@/lib/money";
import { paletteColor, type PaletteKey } from "@/lib/palette";
import type { AssetClass } from "@/lib/kosha/types";

const ASSET_LABELS: Record<AssetClass, string> = {
  equity_mf: "Equity funds",
  debt_mf: "Debt funds",
  stock: "Stocks",
  epf_ppf: "EPF / PPF",
  gold: "Gold",
  fd: "Fixed deposits",
  crypto: "Crypto",
  other: "Other",
};

const ASSET_COLORS: Record<AssetClass, PaletteKey> = {
  equity_mf: "violet",
  debt_mf: "sky",
  stock: "fuchsia",
  epf_ppf: "emerald",
  gold: "amber",
  fd: "teal",
  crypto: "orange",
  other: "slate",
};

interface Props {
  byClass: Record<string, number>; // asset_class -> current value, minor units
}

// Simple proportional allocation bars — no chart library yet (that lands in
// Phase 5 with ECharts). Still gives an at-a-glance mix of the portfolio.
export function AllocationBars({ byClass }: Props) {
  const entries = Object.entries(byClass).filter(([, v]) => v > 0) as [AssetClass, number][];
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (total === 0) return null;

  entries.sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-3 overflow-hidden rounded-full">
        {entries.map(([cls, value]) => (
          <div key={cls} style={{ width: `${(value / total) * 100}%`, backgroundColor: paletteColor(ASSET_COLORS[cls]) }} />
        ))}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {entries.map(([cls, value]) => (
          <div key={cls} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: paletteColor(ASSET_COLORS[cls]) }} />
            <span className="flex-1 truncate text-text-muted">{ASSET_LABELS[cls]}</span>
            <span className="money font-semibold">{Math.round((value / total) * 100)}%</span>
          </div>
        ))}
      </div>
      <p className="money pt-1 text-right text-sm font-semibold">{formatMoney(total)}</p>
    </div>
  );
}
