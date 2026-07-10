"use client";

import { useMemo, useState } from "react";
import { useCategories } from "@/lib/kosha/categories";
import {
  usePeriodTransactions,
  buildCategoryMaps,
  spendByGroup,
  spendByCategoryInGroup,
  spendByGroupByMonth,
  dailySpend,
  incomeRows,
  payeeLeaderboard,
} from "@/lib/kosha/analytics";
import { monthsInPeriod, type Period } from "@/lib/kosha/period";
import { KoshaChart } from "@/components/KoshaChart";
import { ChartCard, EmptyChart } from "./ChartCard";
import { useChartTheme, categoricalColorway, AURORA_STOPS, CHART_SEQUENTIAL } from "@/lib/chartTheme";
import type { EChartsOption } from "@/lib/echarts";
import { formatMoney, formatCompactINR, minorToRupees } from "@/lib/money";
import { format, parseISO } from "date-fns";

export function SpendingSection({ period }: { period: Period }) {
  const { data: categories } = useCategories();
  const { data: txns, isLoading } = usePeriodTransactions(period.from, period.to);
  const { mode, ink } = useChartTheme();

  const maps = useMemo(() => buildCategoryMaps(categories ?? []), [categories]);

  // Stable per-group color: groups in sort order take validated categorical
  // slots; overflow + uncategorized fold to muted. Same slot everywhere.
  const groupColor = useMemo(() => {
    const colorway = categoricalColorway(mode, maps.groups.length, ink.textMuted);
    const m = new Map<string, string>();
    maps.groups.forEach((g, i) => m.set(g.id, colorway[i]));
    m.set("uncategorized", ink.textMuted);
    return m;
  }, [maps, mode, ink]);

  const groupName = useMemo(() => {
    const m = new Map<string, string>();
    maps.groups.forEach((g) => m.set(g.id, `${g.emoji} ${g.name}`));
    m.set("uncategorized", "Uncategorized");
    return m;
  }, [maps]);

  const hasSpend = (txns ?? []).some((t) => t.type === "expense");

  if (isLoading) return <p className="text-text-muted">Loading…</p>;

  return (
    <>
      <SankeyCard txns={txns ?? []} maps={maps} groupColor={groupColor} groupName={groupName} ink={ink} />
      <TrendsCard txns={txns ?? []} maps={maps} groupColor={groupColor} groupName={groupName} period={period} ink={ink} hasSpend={hasSpend} />
      <BreakdownCard txns={txns ?? []} maps={maps} groupColor={groupColor} groupName={groupName} ink={ink} hasSpend={hasSpend} />
      <CalendarCard txns={txns ?? []} period={period} ink={ink} mode={mode} hasSpend={hasSpend} />
      <PayeesCard txns={txns ?? []} ink={ink} mode={mode} />
    </>
  );
}

// ---------------------------------------------------------------------
// 1. Cash-flow Sankey
// ---------------------------------------------------------------------
function SankeyCard({
  txns,
  maps,
  groupColor,
  groupName,
  ink,
}: {
  txns: import("@/lib/kosha/types").Transaction[];
  maps: ReturnType<typeof buildCategoryMaps>;
  groupColor: Map<string, string>;
  groupName: Map<string, string>;
  ink: ReturnType<typeof useChartTheme>["ink"];
}) {
  const option = useMemo<EChartsOption | null>(() => {
    const spend = spendByGroup(txns, maps);
    const income = incomeRows(txns);
    const totalIncome = income.reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalExpense = Array.from(spend.values()).reduce((s, v) => s + v, 0);
    if (totalIncome === 0 && totalExpense === 0) return null;

    // Income sources = income leaf categories.
    const incomeByCat = new Map<string, number>();
    for (const t of income) {
      const key = t.category_id ?? "other_income";
      incomeByCat.set(key, (incomeByCat.get(key) ?? 0) + Math.abs(t.amount));
    }

    const POOL = "Budget";
    // Rightmost-column nodes label to their LEFT (over the flows) —
    // otherwise the names render past the chart edge and get clipped.
    const nodes: { name: string; itemStyle?: { color: string }; label?: { position: "left" | "right" } }[] = [
      { name: POOL, itemStyle: { color: AURORA_STOPS[1] } },
    ];
    const links: { source: string; target: string; value: number }[] = [];

    for (const [catId, amt] of incomeByCat) {
      const name = catId === "other_income" ? "Other income" : maps.byId.get(catId)?.name ?? "Income";
      nodes.push({ name, itemStyle: { color: ink.income } });
      links.push({ source: name, target: POOL, value: minorToRupees(amt) });
    }
    for (const [groupId, amt] of spend) {
      const name = groupName.get(groupId) ?? "Other";
      nodes.push({ name, itemStyle: { color: groupColor.get(groupId) ?? ink.textMuted }, label: { position: "left" } });
      links.push({ source: POOL, target: name, value: minorToRupees(amt) });
    }
    const savings = totalIncome - totalExpense;
    if (savings > 0) {
      nodes.push({ name: "Savings", itemStyle: { color: AURORA_STOPS[2] }, label: { position: "left" } });
      links.push({ source: POOL, target: "Savings", value: minorToRupees(savings) });
    }

    return {
      tooltip: {
        trigger: "item",
        borderWidth: 0,
        backgroundColor: ink.surface,
        textStyle: { color: ink.text },
        formatter: (p: unknown) => {
          const pp = p as { value?: number; name?: string };
          return pp.value != null ? `${pp.name ?? ""}<br/><b>${formatMoney(Math.round((pp.value ?? 0) * 100))}</b>` : pp.name ?? "";
        },
      },
      series: [
        {
          type: "sankey",
          left: 4,
          right: 8,
          top: 8,
          bottom: 8,
          nodeGap: 10,
          nodeWidth: 12,
          draggable: false,
          emphasis: { focus: "adjacency" },
          label: { color: ink.text, fontSize: 11 },
          lineStyle: { color: "gradient", opacity: 0.35, curveness: 0.5 },
          data: nodes,
          links,
        },
      ],
    };
  }, [txns, maps, groupColor, groupName, ink]);

  return (
    <ChartCard title="Cash flow" subtitle="Income → budget → where it goes">
      {option ? <KoshaChart option={option} height={340} ariaLabel="Cash flow Sankey diagram" /> : <EmptyChart message="No income or spending in this period yet." />}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------
// 2. Spending trends — stacked bars by group over months
// ---------------------------------------------------------------------
function TrendsCard({
  txns,
  maps,
  groupColor,
  groupName,
  period,
  ink,
  hasSpend,
}: {
  txns: import("@/lib/kosha/types").Transaction[];
  maps: ReturnType<typeof buildCategoryMaps>;
  groupColor: Map<string, string>;
  groupName: Map<string, string>;
  period: Period;
  ink: ReturnType<typeof useChartTheme>["ink"];
  hasSpend: boolean;
}) {
  const [pct, setPct] = useState(false);

  const option = useMemo<EChartsOption | null>(() => {
    if (!hasSpend) return null;
    const months = monthsInPeriod(period);
    const byMonth = spendByGroupByMonth(txns, maps);
    // Only groups that actually have spend, in stable order.
    const activeGroups = maps.groups.filter((g) => Array.from(byMonth.values()).some((m) => (m.get(g.id) ?? 0) > 0));

    const monthTotals = months.map((mo) => Array.from(byMonth.get(mo)?.values() ?? []).reduce((s, v) => s + v, 0));

    const series = activeGroups.map((g) => ({
      name: groupName.get(g.id) ?? g.name,
      type: "bar" as const,
      stack: "total",
      itemStyle: { color: groupColor.get(g.id), borderRadius: [0, 0, 0, 0] as [number, number, number, number] },
      barMaxWidth: 36,
      data: months.map((mo, i) => {
        const v = byMonth.get(mo)?.get(g.id) ?? 0;
        return pct && monthTotals[i] > 0 ? Math.round((v / monthTotals[i]) * 1000) / 10 : minorToRupees(v);
      }),
    }));

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        borderWidth: 0,
        backgroundColor: ink.surface,
        textStyle: { color: ink.text },
        valueFormatter: (v: unknown) => (pct ? `${v as number}%` : formatCompactINR(Math.round((v as number) * 100))),
      },
      legend: { type: "scroll", bottom: 0, textStyle: { color: ink.textMuted }, icon: "roundRect" },
      grid: { left: 8, right: 12, top: 12, bottom: 44, containLabel: true },
      xAxis: {
        type: "category",
        data: months.map((m) => format(parseISO(`${m}-01`), "MMM")),
        axisLine: { lineStyle: { color: ink.border } },
        axisLabel: { color: ink.textMuted },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: ink.border, opacity: 0.5 } },
        axisLabel: { color: ink.textMuted, formatter: (v: number) => (pct ? `${v}%` : formatCompactINR(Math.round(v * 100))) },
      },
      series,
    };
  }, [txns, maps, groupColor, groupName, period, ink, hasSpend, pct]);

  return (
    <ChartCard
      title="Spending trends"
      subtitle="By category group, per month"
      action={
        <button className="chip ring-[var(--border)]" onClick={() => setPct((v) => !v)}>
          {pct ? "%" : "₹"}
        </button>
      }
    >
      {option ? <KoshaChart option={option} height={300} resetKey={pct ? "pct" : "abs"} ariaLabel="Spending trends stacked bar chart" /> : <EmptyChart message="No spending in this period yet." />}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------
// 3. Category breakdown — sunburst (group → category)
// ---------------------------------------------------------------------
function BreakdownCard({
  txns,
  maps,
  groupColor,
  groupName,
  ink,
  hasSpend,
}: {
  txns: import("@/lib/kosha/types").Transaction[];
  maps: ReturnType<typeof buildCategoryMaps>;
  groupColor: Map<string, string>;
  groupName: Map<string, string>;
  ink: ReturnType<typeof useChartTheme>["ink"];
  hasSpend: boolean;
}) {
  const [view, setView] = useState<"sunburst" | "treemap">("sunburst");

  const data = useMemo(() => {
    const byGroup = spendByCategoryInGroup(txns, maps);
    const nodes: { name: string; value: number; itemStyle: { color: string }; children?: { name: string; value: number }[] }[] = [];
    for (const [groupId, cats] of byGroup) {
      const children = Array.from(cats.entries()).map(([catId, amt]) => ({
        name: catId === "uncategorized" ? "Uncategorized" : maps.byId.get(catId)?.name ?? "—",
        value: minorToRupees(amt),
      }));
      const total = children.reduce((s, c) => s + c.value, 0);
      nodes.push({
        name: (groupName.get(groupId) ?? "Other").replace(/^\S+\s/, ""),
        value: total,
        itemStyle: { color: groupColor.get(groupId) ?? ink.textMuted },
        children,
      });
    }
    return nodes.sort((a, b) => b.value - a.value);
  }, [txns, maps, groupColor, groupName, ink]);

  const option = useMemo<EChartsOption | null>(() => {
    if (!hasSpend) return null;
    const tooltip = {
      trigger: "item" as const,
      borderWidth: 0,
      backgroundColor: ink.surface,
      textStyle: { color: ink.text },
      formatter: (p: unknown) => {
        const pp = p as { name?: string; value?: number };
        return `${pp.name ?? ""}<br/><b>${formatMoney(Math.round((pp.value ?? 0) * 100))}</b>`;
      },
    };
    if (view === "sunburst") {
      return {
        tooltip,
        series: [
          {
            type: "sunburst",
            radius: [16, "92%"],
            data,
            label: { color: ink.text, fontSize: 10, minAngle: 12 },
            itemStyle: { borderColor: ink.surface, borderWidth: 2 },
            levels: [{}, { r0: 16, r: "58%" }, { r0: "58%", r: "92%", label: { fontSize: 9 } }],
          },
        ],
      };
    }
    return {
      tooltip,
      series: [
        {
          type: "treemap",
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          data,
          label: { color: "#fff", fontSize: 11 },
          upperLabel: { show: false },
          itemStyle: { borderColor: ink.surface, borderWidth: 2, gapWidth: 2 },
          levels: [{ itemStyle: { borderWidth: 0, gapWidth: 2 } }, { itemStyle: { gapWidth: 2 } }],
        },
      ],
    };
  }, [data, view, ink, hasSpend]);

  return (
    <ChartCard
      title="Where it goes"
      subtitle="Category breakdown"
      action={
        <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-xs font-semibold">
          <button className={`rounded px-2 py-1 ${view === "sunburst" ? "bg-surface text-text" : "text-text-muted"}`} onClick={() => setView("sunburst")}>
            Sunburst
          </button>
          <button className={`rounded px-2 py-1 ${view === "treemap" ? "bg-surface text-text" : "text-text-muted"}`} onClick={() => setView("treemap")}>
            Treemap
          </button>
        </div>
      }
    >
      {option ? <KoshaChart option={option} height={320} resetKey={view} ariaLabel="Category breakdown" /> : <EmptyChart message="No spending in this period yet." />}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------
// 4. Calendar heatmap — daily spend
// ---------------------------------------------------------------------
function CalendarCard({
  txns,
  period,
  ink,
  mode,
  hasSpend,
}: {
  txns: import("@/lib/kosha/types").Transaction[];
  period: Period;
  ink: ReturnType<typeof useChartTheme>["ink"];
  mode: "light" | "dark";
  hasSpend: boolean;
}) {
  const option = useMemo<EChartsOption | null>(() => {
    if (!hasSpend) return null;
    const daily = dailySpend(txns);
    const points = Array.from(daily.entries()).map(([date, amt]) => [date, minorToRupees(amt)] as [string, number]);
    const max = Math.max(...points.map((p) => p[1]), 1);
    // Constrain the calendar to at most ~1 year for legibility.
    const rangeStart = period.from < format(new Date(new Date(period.to).getTime() - 364 * 864e5), "yyyy-MM-dd")
      ? format(new Date(new Date(period.to).getTime() - 364 * 864e5), "yyyy-MM-dd")
      : period.from;

    return {
      tooltip: {
        borderWidth: 0,
        backgroundColor: ink.surface,
        textStyle: { color: ink.text },
        formatter: (p: unknown) => {
          const pp = p as { value: [string, number] };
          return `${format(parseISO(pp.value[0]), "EEE, MMM d")}<br/><b>${formatMoney(Math.round(pp.value[1] * 100))}</b>`;
        },
      },
      visualMap: {
        min: 0,
        max,
        show: false,
        inRange: { color: mode === "dark" ? ["#1a2036", ...CHART_SEQUENTIAL.slice(6)] : CHART_SEQUENTIAL.slice(0, 8) },
      },
      calendar: {
        top: 20,
        left: 24,
        right: 8,
        cellSize: ["auto", 14],
        range: [rangeStart, period.to],
        splitLine: { show: false },
        itemStyle: { color: "transparent", borderColor: ink.border, borderWidth: 1 },
        yearLabel: { show: false },
        monthLabel: { color: ink.textMuted, fontSize: 10 },
        dayLabel: { color: ink.textMuted, fontSize: 9, firstDay: 1 },
      },
      series: [{ type: "heatmap", coordinateSystem: "calendar", data: points }],
    };
  }, [txns, period, ink, mode, hasSpend]);

  return (
    <ChartCard title="Daily spend" subtitle="Darker = a heavier day">
      {option ? <KoshaChart option={option} height={200} ariaLabel="Daily spend calendar heatmap" /> : <EmptyChart message="No spending in this period yet." />}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------
// 5. Payee leaderboard
// ---------------------------------------------------------------------
function PayeesCard({
  txns,
  ink,
  mode,
}: {
  txns: import("@/lib/kosha/types").Transaction[];
  ink: ReturnType<typeof useChartTheme>["ink"];
  mode: "light" | "dark";
}) {
  const stats = useMemo(() => payeeLeaderboard(txns, 10), [txns]);

  const option = useMemo<EChartsOption | null>(() => {
    if (stats.length === 0) return null;
    const ordered = [...stats].reverse(); // ECharts bars stack bottom-up
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        borderWidth: 0,
        backgroundColor: ink.surface,
        textStyle: { color: ink.text },
        formatter: (p: unknown) => {
          const arr = p as { name: string; value: number; dataIndex: number }[];
          const s = ordered[arr[0].dataIndex];
          return `${s.payee}<br/><b>${formatMoney(s.total)}</b> · ${s.count}×`;
        },
      },
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: "value", splitLine: { lineStyle: { color: ink.border, opacity: 0.5 } }, axisLabel: { color: ink.textMuted, formatter: (v: number) => formatCompactINR(Math.round(v * 100)) } },
      yAxis: { type: "category", data: ordered.map((s) => s.payee), axisLine: { lineStyle: { color: ink.border } }, axisLabel: { color: ink.textMuted } },
      series: [
        {
          type: "bar",
          data: ordered.map((s) => minorToRupees(s.total)),
          itemStyle: { color: mode === "dark" ? "#3987e5" : "#2a78d6", borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 18,
        },
      ],
    };
  }, [stats, ink, mode]);

  return (
    <ChartCard title="Top payees" subtitle="Where the money actually goes">
      {option ? <KoshaChart option={option} height={Math.max(160, stats.length * 30)} ariaLabel="Top payees bar chart" /> : <EmptyChart message="No payees recorded in this period." />}
    </ChartCard>
  );
}
