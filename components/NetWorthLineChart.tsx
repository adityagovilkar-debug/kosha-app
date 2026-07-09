"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { formatMoney } from "@/lib/money";
import type { NetWorthSnapshot } from "@/lib/kosha/types";

interface Props {
  snapshots: NetWorthSnapshot[];
}

// Lightweight hand-rolled SVG line chart for net worth over time. The full
// charting suite (ECharts) arrives in Phase 5 — this is just enough to make
// the trend legible now. viewBox coordinates; the SVG scales responsively.
export function NetWorthLineChart({ snapshots }: Props) {
  const W = 700;
  const H = 220;
  const PAD = 8;

  const series = useMemo(
    () => snapshots.map((s) => ({ date: s.date, value: s.total_assets - s.total_liabilities })),
    [snapshots],
  );

  if (series.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border text-sm text-text-muted" style={{ borderColor: "var(--border)" }}>
        Net worth trend will appear once you&apos;ve used Kosha for a couple of days.
      </div>
    );
  }

  const values = series.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;

  const x = (i: number) => PAD + (i / (series.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / range) * (H - 2 * PAD);

  const linePath = series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${x(series.length - 1).toFixed(1)} ${y(min).toFixed(1)} L ${x(0).toFixed(1)} ${y(min).toFixed(1)} Z`;
  const zeroY = y(0);

  const latest = series[series.length - 1].value;
  const first = series[0].value;
  const delta = latest - first;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <p className="money text-2xl font-bold">{formatMoney(latest)}</p>
        <p className={`money text-sm font-semibold ${delta >= 0 ? "text-income" : "text-expense"}`}>
          {delta >= 0 ? "▲" : "▼"} {formatMoney(Math.abs(delta))} since {format(parseISO(series[0].date), "MMM d")}
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" role="img" aria-label="Net worth over time">
        <defs>
          <linearGradient id="kosha-nw-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="kosha-nw-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="55%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>
        {min < 0 && max > 0 && (
          <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="var(--border)" strokeDasharray="3 3" strokeWidth={1} />
        )}
        <path d={areaPath} fill="url(#kosha-nw-fill)" />
        <path d={linePath} fill="none" stroke="url(#kosha-nw-line)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}
