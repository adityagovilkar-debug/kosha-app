"use client";

import { useMemo } from "react";
import { getDaysInMonth, format, parseISO } from "date-fns";
import { useBudgets, useBudgetPeriodSpend } from "@/lib/kosha/budgets";
import { useRecurringRules } from "@/lib/kosha/recurring";
import { useCategories } from "@/lib/kosha/categories";
import { KoshaChart } from "@/components/KoshaChart";
import { ChartCard, EmptyChart } from "./ChartCard";
import { useChartTheme, CHART_STATUS } from "@/lib/chartTheme";
import type { EChartsOption } from "@/lib/echarts";
import { formatMoney, formatCompactINR, minorToRupees } from "@/lib/money";
import type { Frequency } from "@/lib/kosha/types";

const PER_YEAR: Record<Frequency, number> = { daily: 365, weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };

export function PlanSection() {
  const { data: budgets } = useBudgets();
  const { data: spend } = useBudgetPeriodSpend();
  const { data: rules } = useRecurringRules();
  const { data: categories } = useCategories();
  const { ink } = useChartTheme();

  const categoriesById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  // Rename off `.current` — the React Compiler mistakes `spend.current` for a
  // ref access and bails out of optimizing the memo below.
  const spendByCat = spend?.current;

  // Budgets bullet: spent vs envelope per category, with a month-pace marker.
  const budgetOption = useMemo<EChartsOption | null>(() => {
    if (!budgets || budgets.length === 0) return null;
    const now = new Date();
    const paceFrac = now.getDate() / getDaysInMonth(now);
    const rows = budgets.map((b) => {
      const cat = categoriesById.get(b.category_id);
      const spent = spendByCat?.[b.category_id] ?? 0;
      return { name: cat ? `${cat.emoji} ${cat.name}` : "—", spent: minorToRupees(spent), budget: minorToRupees(b.amount), over: spent > b.amount };
    });
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        borderWidth: 0,
        backgroundColor: ink.surface,
        textStyle: { color: ink.text },
        formatter: (p: unknown) => {
          const arr = p as { dataIndex: number }[];
          const r = rows[arr[0].dataIndex];
          return `${r.name}<br/><b>${formatMoney(Math.round(r.spent * 100))}</b> of ${formatMoney(Math.round(r.budget * 100))}`;
        },
      },
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: "value", splitLine: { lineStyle: { color: ink.border, opacity: 0.5 } }, axisLabel: { color: ink.textMuted, formatter: (v: number) => formatCompactINR(Math.round(v * 100)) } },
      yAxis: { type: "category", data: rows.map((r) => r.name), axisLine: { lineStyle: { color: ink.border } }, axisLabel: { color: ink.textMuted } },
      series: [
        // Envelope track.
        { type: "bar", data: rows.map((r) => r.budget), itemStyle: { color: ink.border, borderRadius: 4 }, barGap: "-100%", barMaxWidth: 16, silent: true, z: 1 },
        // Spent, colored by status.
        {
          type: "bar",
          data: rows.map((r) => ({ value: r.spent, itemStyle: { color: r.over ? CHART_STATUS.critical : CHART_STATUS.good, borderRadius: 4 } })),
          barMaxWidth: 16,
          z: 2,
          markLine: {
            symbol: "none",
            silent: true,
            lineStyle: { color: ink.text, type: "dashed", width: 1 },
            label: { show: false },
            // pace marker per row = budget * fraction-of-month elapsed
            data: rows.map((r, i) => [
              { yAxis: i, xAxis: r.budget * paceFrac },
              { yAxis: i, xAxis: r.budget * paceFrac },
            ]) as unknown as object[],
          },
        },
      ],
    };
  }, [budgets, spendByCat, categoriesById, ink]);

  // Subscriptions: annualized cost by rule.
  const activeSubs = useMemo(() => (rules ?? []).filter((r) => r.type === "expense" || r.type === "investment_buy"), [rules]);
  const annualTotal = useMemo(() => activeSubs.reduce((s, r) => s + r.amount * PER_YEAR[r.frequency] * (1 / r.interval), 0), [activeSubs]);

  const subsOption = useMemo<EChartsOption | null>(() => {
    if (activeSubs.length === 0) return null;
    const rows = activeSubs
      .map((r) => ({ name: r.name, annual: minorToRupees(r.amount * PER_YEAR[r.frequency] * (1 / r.interval)) }))
      .sort((a, b) => a.annual - b.annual);
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        borderWidth: 0,
        backgroundColor: ink.surface,
        textStyle: { color: ink.text },
        valueFormatter: (v: unknown) => `${formatMoney(Math.round((v as number) * 100))}/yr`,
      },
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: "value", splitLine: { lineStyle: { color: ink.border, opacity: 0.5 } }, axisLabel: { color: ink.textMuted, formatter: (v: number) => formatCompactINR(Math.round(v * 100)) } },
      yAxis: { type: "category", data: rows.map((r) => r.name), axisLine: { lineStyle: { color: ink.border } }, axisLabel: { color: ink.textMuted } },
      series: [{ type: "bar", data: rows.map((r) => r.annual), itemStyle: { color: "#9085e9", borderRadius: [0, 4, 4, 0] }, barMaxWidth: 18 }],
    };
  }, [activeSubs, ink]);

  return (
    <>
      <ChartCard title="Budgets" subtitle="Spent vs envelope · dashed line = pace">
        {budgetOption ? <KoshaChart option={budgetOption} height={Math.max(160, (budgets?.length ?? 0) * 40)} ariaLabel="Budget bullet chart" /> : <EmptyChart message="Set budgets under Plan to track them here." />}
      </ChartCard>

      <ChartCard
        title="Subscriptions & recurring"
        subtitle={activeSubs.length ? `About ${formatMoney(Math.round(annualTotal))}/year committed` : undefined}
      >
        {subsOption ? (
          <>
            <KoshaChart option={subsOption} height={Math.max(140, activeSubs.length * 32)} ariaLabel="Annualized subscription cost" />
            <div className="mt-3 space-y-1">
              {activeSubs
                .slice()
                .sort((a, b) => a.next_due.localeCompare(b.next_due))
                .slice(0, 4)
                .map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Next: {r.name}</span>
                    <span className="font-medium">{format(parseISO(r.next_due), "MMM d")}</span>
                  </div>
                ))}
            </div>
          </>
        ) : (
          <EmptyChart message="Add recurring rules under Plan to see their annual cost." />
        )}
      </ChartCard>
    </>
  );
}
