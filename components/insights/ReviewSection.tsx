"use client";

import { useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { useCategories } from "@/lib/kosha/categories";
import {
  usePeriodTransactions,
  buildCategoryMaps,
  expenseLeaves,
  incomeRows,
  spendByGroup,
  payeeLeaderboard,
} from "@/lib/kosha/analytics";
import { resolvePeriod, indianFY } from "@/lib/kosha/period";
import { ChartCard } from "./ChartCard";
import { useChartTheme } from "@/lib/chartTheme";
import { formatMoney, formatCompactINR } from "@/lib/money";
import { APP_NAME } from "@/lib/brand";

type ReviewMode = "month" | "fy";

interface PosterRowData {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

// Month-in-review and Year-in-review share one poster; the year adds
// FY-specific rows (best month, top payee) with tighter spacing.
export function ReviewSection() {
  const [mode, setMode] = useState<ReviewMode>("month");
  const { data: categories } = useCategories();
  useChartTheme();
  const svgRef = useRef<SVGSVGElement>(null);

  // Current + comparison periods for the selected mode. The Indian FY runs
  // Apr–Mar, so "last year" is the previous FY, not the calendar year.
  const { period, prevPeriod, periodLabel, deltaLabel, fileTag } = useMemo(() => {
    if (mode === "month") {
      return {
        period: resolvePeriod("this_month"),
        prevPeriod: resolvePeriod("last_month"),
        periodLabel: format(new Date(), "MMMM yyyy"),
        deltaLabel: "Vs last month",
        fileTag: format(new Date(), "yyyy-MM"),
      };
    }
    const fy = indianFY(new Date());
    const label = `FY${(fy.startYear % 100).toString().padStart(2, "0")}–${((fy.startYear + 1) % 100).toString().padStart(2, "0")}`;
    const iso = (d: Date) => format(d, "yyyy-MM-dd");
    return {
      period: { from: iso(fy.from), to: iso(fy.to) },
      prevPeriod: { from: `${fy.startYear - 1}-04-01`, to: `${fy.startYear}-03-31` },
      periodLabel: label,
      deltaLabel: "Vs last FY",
      fileTag: label.replace("–", "-"),
    };
  }, [mode]);

  const { data: txns } = usePeriodTransactions(period.from, period.to);
  const { data: prevTxns } = usePeriodTransactions(prevPeriod.from, prevPeriod.to);

  const maps = useMemo(() => buildCategoryMaps(categories ?? []), [categories]);

  const stats = useMemo(() => {
    const rows = txns ?? [];
    const incomes = incomeRows(rows);
    const leaves = expenseLeaves(rows);
    const income = incomes.reduce((s, t) => s + Math.abs(t.amount), 0);
    const expense = leaves.reduce((s, t) => s + Math.abs(t.amount), 0);
    const savings = income - expense;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;

    const biggest = leaves.reduce<{ amount: number; label: string } | null>((max, t) => {
      const amt = Math.abs(t.amount);
      if (!max || amt > max.amount) return { amount: amt, label: t.payee || maps.byId.get(t.category_id ?? "")?.name || "Expense" };
      return max;
    }, null);

    const byGroup = spendByGroup(rows, maps);
    let topGroup: { name: string; amount: number } | null = null;
    for (const [gid, amt] of byGroup) {
      if (!topGroup || amt > topGroup.amount) {
        const g = maps.groups.find((x) => x.id === gid);
        topGroup = { name: g ? `${g.emoji} ${g.name}` : "Uncategorized", amount: amt };
      }
    }

    const prevExpense = expenseLeaves(prevTxns ?? []).reduce((s, t) => s + Math.abs(t.amount), 0);
    const expenseDelta = prevExpense > 0 ? ((expense - prevExpense) / prevExpense) * 100 : null;

    // FY extras: the month with the highest savings, and the top payee.
    const monthly = new Map<string, number>();
    for (const t of incomes) monthly.set(t.date.slice(0, 7), (monthly.get(t.date.slice(0, 7)) ?? 0) + Math.abs(t.amount));
    for (const t of leaves) monthly.set(t.date.slice(0, 7), (monthly.get(t.date.slice(0, 7)) ?? 0) - Math.abs(t.amount));
    let bestMonth: { label: string; saved: number } | null = null;
    for (const [month, saved] of monthly) {
      if (!bestMonth || saved > bestMonth.saved) bestMonth = { label: format(parseISO(`${month}-01`), "MMMM"), saved };
    }
    const topPayee = payeeLeaderboard(rows, 1)[0] ?? null;

    return { income, expense, savings, savingsRate, biggest, topGroup, expenseDelta, bestMonth, topPayee };
  }, [txns, prevTxns, maps]);

  const posterRows = useMemo<PosterRowData[]>(() => {
    const deltaRow: PosterRowData = {
      label: deltaLabel,
      value: stats.expenseDelta == null ? "—" : `${stats.expenseDelta >= 0 ? "▲" : "▼"} ${Math.abs(stats.expenseDelta).toFixed(0)}% spend`,
      color: stats.expenseDelta != null && stats.expenseDelta <= 0 ? "#2dd4bf" : "#ff8a65",
    };
    const common: PosterRowData[] = [
      { label: "Money in", value: formatMoney(stats.income), color: "#2dd4bf" },
      { label: "Money out", value: formatMoney(stats.expense), color: "#ff8a65" },
      { label: "Biggest expense", value: stats.biggest ? formatCompactINR(stats.biggest.amount) : "—", sub: stats.biggest?.label },
      { label: "Top category", value: stats.topGroup?.name ?? "—" },
    ];
    if (mode === "month") return [...common, deltaRow];
    return [
      ...common,
      { label: "Best month", value: stats.bestMonth ? stats.bestMonth.label : "—", sub: stats.bestMonth ? `saved ${formatCompactINR(Math.max(0, stats.bestMonth.saved))}` : undefined },
      { label: "Top payee", value: stats.topPayee?.payee ?? "—", sub: stats.topPayee ? `${stats.topPayee.count}× · ${formatCompactINR(stats.topPayee.total)}` : undefined },
      deltaRow,
    ];
  }, [mode, stats, deltaLabel]);

  function exportImage() {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = 600 * scale;
      canvas.height = 750 * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, 600, 750);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kosha-${fileTag}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(mode === "month" ? "Saved your month-in-review" : "Saved your year-in-review");
      }, "image/png");
    };
    img.onerror = () => toast.error("Couldn't export the image");
    img.src = svg64;
  }

  const rowStartY = 330;
  const rowStep = posterRows.length > 5 ? 56 : 70;

  return (
    <ChartCard
      title={mode === "month" ? "Month in review" : "Year in review"}
      subtitle={periodLabel}
      action={
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-xs font-semibold">
            <button className={`rounded px-2 py-1 ${mode === "month" ? "bg-surface text-text" : "text-text-muted"}`} onClick={() => setMode("month")}>
              Month
            </button>
            <button className={`rounded px-2 py-1 ${mode === "fy" ? "bg-surface text-text" : "text-text-muted"}`} onClick={() => setMode("fy")}>
              FY
            </button>
          </div>
          <button className="btn-outline !min-h-0 !py-1.5 !px-3 text-sm" onClick={exportImage}>
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      }
    >
      <div className="overflow-hidden rounded-2xl">
        {/* The poster is an SVG so display and PNG export are the same artifact. */}
        <svg ref={svgRef} viewBox="0 0 600 750" width="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
          <defs>
            <linearGradient id="kosha-review-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0b0f1e" />
              <stop offset="100%" stopColor="#12172b" />
            </linearGradient>
            <linearGradient id="kosha-review-accent" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="55%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#2dd4bf" />
            </linearGradient>
          </defs>
          <rect width="600" height="750" fill="url(#kosha-review-bg)" />
          <text x="40" y="64" fill="#9aa3c0" fontSize="16" fontFamily="system-ui, sans-serif" fontWeight="600" letterSpacing="2">
            {APP_NAME.toUpperCase()} · {periodLabel.toUpperCase()}
          </text>

          <text x="40" y="150" fill="#9aa3c0" fontSize="18" fontFamily="system-ui, sans-serif">You saved</text>
          <text x="40" y="212" fill="url(#kosha-review-accent)" fontSize="64" fontWeight="800" fontFamily="system-ui, sans-serif">
            {formatMoney(Math.max(0, stats.savings))}
          </text>
          <text x="40" y="246" fill="#eef1fb" fontSize="18" fontFamily="system-ui, sans-serif">
            a {stats.savingsRate.toFixed(0)}% savings rate
          </text>

          <line x1="40" y1="290" x2="560" y2="290" stroke="#262d47" strokeWidth="1" />

          {posterRows.map((row, i) => (
            <PosterRow key={row.label} y={rowStartY + i * rowStep} label={row.label} value={row.value} sub={row.sub} color={row.color} />
          ))}

          <text x="40" y="712" fill="#61667a" fontSize="13" fontFamily="system-ui, sans-serif">
            Your treasury, at a glance.
          </text>
        </svg>
      </div>
    </ChartCard>
  );
}

function PosterRow({ y, label, value, sub, color = "#eef1fb" }: { y: number; label: string; value: string; sub?: string; color?: string }) {
  return (
    <>
      <text x="40" y={y} fill="#9aa3c0" fontSize="16" fontFamily="system-ui, sans-serif">
        {label}
      </text>
      <text x="560" y={y} fill={color} fontSize="24" fontWeight="700" fontFamily="system-ui, sans-serif" textAnchor="end">
        {value}
      </text>
      {sub && (
        <text x="560" y={y + 20} fill="#61667a" fontSize="12" fontFamily="system-ui, sans-serif" textAnchor="end">
          {sub}
        </text>
      )}
    </>
  );
}
