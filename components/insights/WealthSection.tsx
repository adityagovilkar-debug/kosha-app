"use client";

import { useMemo } from "react";
import { useNetWorthHistory } from "@/lib/kosha/netWorth";
import { useHoldings, useLatestPrices, useAllInvestmentTransactions, summarizeHolding } from "@/lib/kosha/holdings";
import { KoshaChart } from "@/components/KoshaChart";
import { ChartCard, EmptyChart } from "./ChartCard";
import { useChartTheme, categoricalColorway } from "@/lib/chartTheme";
import type { EChartsOption } from "@/lib/echarts";
import { formatMoney, formatCompactINR, minorToRupees } from "@/lib/money";
import { format, parseISO } from "date-fns";

export function WealthSection() {
  const { data: snapshots } = useNetWorthHistory();
  const { data: holdings } = useHoldings();
  const { data: latestPrices } = useLatestPrices();
  const { data: investmentTxns } = useAllInvestmentTransactions();
  const { mode, ink } = useChartTheme();

  const summaries = useMemo(() => {
    if (!holdings || !investmentTxns) return [];
    return holdings.map((h) => summarizeHolding(h, investmentTxns.filter((t) => t.holding_id === h.id), latestPrices?.[h.id]));
  }, [holdings, investmentTxns, latestPrices]);

  // Net worth stacked area: assets above zero, liabilities below.
  const netWorthOption = useMemo<EChartsOption | null>(() => {
    if (!snapshots || snapshots.length < 2) return null;
    const dates = snapshots.map((s) => s.date);
    return {
      tooltip: {
        trigger: "axis",
        borderWidth: 0,
        backgroundColor: ink.surface,
        textStyle: { color: ink.text },
        valueFormatter: (v: unknown) => formatCompactINR(Math.round((v as number) * 100)),
      },
      legend: { bottom: 0, textStyle: { color: ink.textMuted }, icon: "roundRect" },
      grid: { left: 8, right: 12, top: 12, bottom: 40, containLabel: true },
      xAxis: { type: "category", data: dates.map((d) => format(parseISO(d), "MMM d")), axisLine: { lineStyle: { color: ink.border } }, axisLabel: { color: ink.textMuted } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: ink.border, opacity: 0.5 } }, axisLabel: { color: ink.textMuted, formatter: (v: number) => formatCompactINR(Math.round(v * 100)) } },
      series: [
        {
          name: "Assets",
          type: "line",
          stack: "nw",
          smooth: true,
          symbol: "none",
          lineStyle: { width: 2, color: ink.income },
          areaStyle: { color: ink.income, opacity: 0.18 },
          data: snapshots.map((s) => minorToRupees(s.total_assets)),
        },
        {
          name: "Liabilities",
          type: "line",
          smooth: true,
          symbol: "none",
          lineStyle: { width: 2, color: ink.expense },
          areaStyle: { color: ink.expense, opacity: 0.14 },
          data: snapshots.map((s) => -minorToRupees(s.total_liabilities)),
        },
      ],
    };
  }, [snapshots, ink]);

  // Portfolio value vs invested over the holdings (as bars — one pair per holding).
  const portfolioOption = useMemo<EChartsOption | null>(() => {
    if (summaries.length === 0) return null;
    const withValue = summaries.filter((s) => s.currentValue > 0 || s.investedNet > 0);
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        borderWidth: 0,
        backgroundColor: ink.surface,
        textStyle: { color: ink.text },
        valueFormatter: (v: unknown) => formatMoney(Math.round((v as number) * 100)),
      },
      legend: { bottom: 0, textStyle: { color: ink.textMuted }, icon: "roundRect" },
      grid: { left: 8, right: 12, top: 12, bottom: 40, containLabel: true },
      xAxis: { type: "category", data: withValue.map((s) => s.holding.name), axisLine: { lineStyle: { color: ink.border } }, axisLabel: { color: ink.textMuted, interval: 0, rotate: withValue.length > 4 ? 30 : 0, fontSize: 10 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: ink.border, opacity: 0.5 } }, axisLabel: { color: ink.textMuted, formatter: (v: number) => formatCompactINR(Math.round(v * 100)) } },
      series: [
        { name: "Invested", type: "bar", data: withValue.map((s) => minorToRupees(s.investedNet)), itemStyle: { color: ink.textMuted, borderRadius: [3, 3, 0, 0] }, barGap: "-100%", barMaxWidth: 40 },
        { name: "Value", type: "bar", data: withValue.map((s) => minorToRupees(s.currentValue)), itemStyle: { color: mode === "dark" ? "#3987e5" : "#2a78d6", borderRadius: [3, 3, 0, 0] }, barMaxWidth: 24 },
      ],
    };
  }, [summaries, ink, mode]);

  // Allocation donut by asset class.
  const allocationOption = useMemo<EChartsOption | null>(() => {
    if (summaries.length === 0) return null;
    const byClass = new Map<string, number>();
    for (const s of summaries) byClass.set(s.holding.asset_class, (byClass.get(s.holding.asset_class) ?? 0) + s.currentValue);
    const entries = Array.from(byClass.entries()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return null;
    const colorway = categoricalColorway(mode, entries.length, ink.textMuted);
    return {
      tooltip: { trigger: "item", borderWidth: 0, backgroundColor: ink.surface, textStyle: { color: ink.text }, valueFormatter: (v: unknown) => formatMoney(Math.round((v as number) * 100)) },
      legend: { bottom: 0, textStyle: { color: ink.textMuted }, icon: "circle" },
      series: [
        {
          type: "pie",
          radius: ["45%", "72%"],
          center: ["50%", "44%"],
          itemStyle: { borderColor: ink.surface, borderWidth: 2 },
          label: { color: ink.text, fontSize: 10 },
          data: entries.map(([cls, v], i) => ({ name: cls.replace("_", " "), value: minorToRupees(v), itemStyle: { color: colorway[i] } })),
        },
      ],
    };
  }, [summaries, ink, mode]);

  const totalValue = summaries.reduce((s, x) => s + x.currentValue, 0);
  const totalInvested = summaries.reduce((s, x) => s + x.investedNet, 0);

  return (
    <>
      <ChartCard title="Net worth over time" subtitle="Assets above, liabilities below">
        {netWorthOption ? <KoshaChart option={netWorthOption} height={280} ariaLabel="Net worth over time" /> : <EmptyChart message="Your net-worth trend fills in over a few days of use." />}
      </ChartCard>

      <ChartCard title="Portfolio" subtitle={summaries.length ? `${formatMoney(totalValue)} value · ${formatMoney(totalInvested)} invested` : undefined}>
        {portfolioOption ? <KoshaChart option={portfolioOption} height={280} ariaLabel="Portfolio value versus invested" /> : <EmptyChart message="Add holdings under Wealth to see your portfolio." />}
      </ChartCard>

      {allocationOption && (
        <ChartCard title="Allocation" subtitle="By asset class">
          <KoshaChart option={allocationOption} height={260} ariaLabel="Asset allocation donut" />
        </ChartCard>
      )}
    </>
  );
}
