"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { useCategories } from "@/lib/kosha/categories";
import { usePeriodTransactions, buildCategoryMaps, incomeRows } from "@/lib/kosha/analytics";
import { monthsInPeriod, indianFY, type Period } from "@/lib/kosha/period";
import { KoshaChart } from "@/components/KoshaChart";
import { ChartCard, EmptyChart } from "./ChartCard";
import { useChartTheme, categoricalColorway } from "@/lib/chartTheme";
import type { EChartsOption } from "@/lib/echarts";
import { formatMoney, formatCompactINR, minorToRupees } from "@/lib/money";

export function IncomeTaxSection({ period }: { period: Period }) {
  const { data: categories } = useCategories();
  const { data: txns } = usePeriodTransactions(period.from, period.to);
  const { mode, ink } = useChartTheme();

  const maps = useMemo(() => buildCategoryMaps(categories ?? []), [categories]);
  const income = useMemo(() => incomeRows(txns ?? []), [txns]);

  // Income by source (leaf category) per month, stacked.
  const incomeOption = useMemo<EChartsOption | null>(() => {
    if (income.length === 0) return null;
    const months = monthsInPeriod(period);
    const sources = new Map<string, Map<string, number>>(); // catId -> month -> amt
    for (const t of income) {
      const catId = t.category_id ?? "other";
      const month = t.date.slice(0, 7);
      if (!sources.has(catId)) sources.set(catId, new Map());
      const m = sources.get(catId)!;
      m.set(month, (m.get(month) ?? 0) + Math.abs(t.amount));
    }
    const catIds = Array.from(sources.keys());
    const colorway = categoricalColorway(mode, catIds.length, ink.textMuted);
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        borderWidth: 0,
        backgroundColor: ink.surface,
        textStyle: { color: ink.text },
        valueFormatter: (v: unknown) => formatCompactINR(Math.round((v as number) * 100)),
      },
      legend: { type: "scroll", bottom: 0, textStyle: { color: ink.textMuted }, icon: "roundRect" },
      grid: { left: 8, right: 12, top: 12, bottom: 44, containLabel: true },
      xAxis: { type: "category", data: months.map((m) => format(parseISO(`${m}-01`), "MMM")), axisLine: { lineStyle: { color: ink.border } }, axisLabel: { color: ink.textMuted } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: ink.border, opacity: 0.5 } }, axisLabel: { color: ink.textMuted, formatter: (v: number) => formatCompactINR(Math.round(v * 100)) } },
      series: catIds.map((catId, i) => ({
        name: catId === "other" ? "Other income" : maps.byId.get(catId)?.name ?? "Income",
        type: "bar" as const,
        stack: "income",
        barMaxWidth: 36,
        itemStyle: { color: colorway[i] },
        data: months.map((mo) => minorToRupees(sources.get(catId)?.get(mo) ?? 0)),
      })),
    };
  }, [income, period, maps, mode, ink]);

  // Taxes summary — TDS captured on income rows, aligned to the Indian FY.
  const taxSummary = useMemo(() => {
    const totalGross = income.reduce((s, t) => s + (t.gross_amount ?? Math.abs(t.amount)), 0);
    const totalTds = income.reduce((s, t) => s + (t.tds_amount ?? 0), 0);
    const refunds = (txns ?? []).filter((t) => t.type === "tax_refund").reduce((s, t) => s + Math.abs(t.amount), 0);
    const fy = indianFY(new Date(period.to));
    const fyLabel = `FY${(fy.startYear % 100).toString().padStart(2, "0")}–${((fy.startYear + 1) % 100).toString().padStart(2, "0")}`;
    const effRate = totalGross > 0 ? (totalTds / totalGross) * 100 : 0;
    return { totalGross, totalTds, refunds, fyLabel, effRate };
  }, [income, txns, period]);

  return (
    <>
      <ChartCard title="Income by source" subtitle="Per month">
        {incomeOption ? <KoshaChart option={incomeOption} height={280} ariaLabel="Income by source" /> : <EmptyChart message="No income logged in this period yet." />}
      </ChartCard>

      <ChartCard title="Taxes" subtitle={`TDS & refunds · ${taxSummary.fyLabel} basis`}>
        {taxSummary.totalTds === 0 && taxSummary.refunds === 0 ? (
          <EmptyChart message="Log salary with a gross/TDS breakdown to track taxes here." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Gross income" value={formatMoney(taxSummary.totalGross)} />
            <Stat label="TDS deducted" value={formatMoney(taxSummary.totalTds)} tone="expense" />
            <Stat label="Refunds" value={formatMoney(taxSummary.refunds)} tone="income" />
            <Stat label="Effective TDS" value={`${taxSummary.effRate.toFixed(1)}%`} />
          </div>
        )}
      </ChartCard>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "income" | "expense" }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`money mt-1 text-lg font-bold ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}>{value}</p>
    </div>
  );
}
