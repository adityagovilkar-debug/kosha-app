"use client";

import { useMemo, useRef } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { useCategories } from "@/lib/kosha/categories";
import { usePeriodTransactions, buildCategoryMaps, expenseLeaves, incomeRows, spendByGroup } from "@/lib/kosha/analytics";
import { resolvePeriod } from "@/lib/kosha/period";
import { ChartCard } from "./ChartCard";
import { useChartTheme } from "@/lib/chartTheme";
import { formatMoney, formatCompactINR } from "@/lib/money";
import { APP_NAME } from "@/lib/brand";

export function ReviewSection() {
  const thisMonth = useMemo(() => resolvePeriod("this_month"), []);
  const lastMonth = useMemo(() => resolvePeriod("last_month"), []);
  const { data: categories } = useCategories();
  const { data: txns } = usePeriodTransactions(thisMonth.from, thisMonth.to);
  const { data: prevTxns } = usePeriodTransactions(lastMonth.from, lastMonth.to);
  useChartTheme();
  const svgRef = useRef<SVGSVGElement>(null);

  const maps = useMemo(() => buildCategoryMaps(categories ?? []), [categories]);

  const stats = useMemo(() => {
    const rows = txns ?? [];
    const income = incomeRows(rows).reduce((s, t) => s + Math.abs(t.amount), 0);
    const leaves = expenseLeaves(rows);
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

    return { income, expense, savings, savingsRate, biggest, topGroup, expenseDelta };
  }, [txns, prevTxns, maps]);

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
        a.download = `kosha-${format(new Date(), "yyyy-MM")}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Saved your month-in-review");
      }, "image/png");
    };
    img.onerror = () => toast.error("Couldn't export the image");
    img.src = svg64;
  }

  const monthLabel = format(new Date(), "MMMM yyyy");

  return (
    <ChartCard
      title="Month in review"
      subtitle={monthLabel}
      action={
        <button className="btn-outline !min-h-0 !py-1.5 !px-3 text-sm" onClick={exportImage}>
          <Download className="h-4 w-4" /> Export
        </button>
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
            {APP_NAME.toUpperCase()} · {monthLabel.toUpperCase()}
          </text>

          <text x="40" y="150" fill="#9aa3c0" fontSize="18" fontFamily="system-ui, sans-serif">You saved</text>
          <text x="40" y="212" fill="url(#kosha-review-accent)" fontSize="64" fontWeight="800" fontFamily="system-ui, sans-serif">
            {formatMoney(Math.max(0, stats.savings))}
          </text>
          <text x="40" y="246" fill="#eef1fb" fontSize="18" fontFamily="system-ui, sans-serif">
            a {stats.savingsRate.toFixed(0)}% savings rate
          </text>

          <line x1="40" y1="290" x2="560" y2="290" stroke="#262d47" strokeWidth="1" />

          <PosterRow y={340} label="Money in" value={formatMoney(stats.income)} color="#2dd4bf" />
          <PosterRow y={410} label="Money out" value={formatMoney(stats.expense)} color="#ff8a65" />
          <PosterRow
            y={480}
            label="Biggest expense"
            value={stats.biggest ? formatCompactINR(stats.biggest.amount) : "—"}
            sub={stats.biggest?.label}
          />
          <PosterRow y={560} label="Top category" value={stats.topGroup?.name ?? "—"} />
          <PosterRow
            y={630}
            label="Vs last month"
            value={stats.expenseDelta == null ? "—" : `${stats.expenseDelta >= 0 ? "▲" : "▼"} ${Math.abs(stats.expenseDelta).toFixed(0)}%`}
            color={stats.expenseDelta != null && stats.expenseDelta <= 0 ? "#2dd4bf" : "#ff8a65"}
          />

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
      <text x="560" y={y} fill={color} fontSize="26" fontWeight="700" fontFamily="system-ui, sans-serif" textAnchor="end">
        {value}
      </text>
      {sub && (
        <text x="560" y={y + 22} fill="#61667a" fontSize="13" fontFamily="system-ui, sans-serif" textAnchor="end">
          {sub}
        </text>
      )}
    </>
  );
}
