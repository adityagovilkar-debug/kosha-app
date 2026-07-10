"use client";

import { useMemo } from "react";
import { usePeriodTransactions, tripSpend } from "@/lib/kosha/analytics";
import type { Period } from "@/lib/kosha/period";
import { ChartCard, EmptyChart } from "./ChartCard";
import { useChartTheme } from "@/lib/chartTheme";
import { formatMoney } from "@/lib/money";

// Formats a foreign amount in its own currency (minor units → e.g. "€142.50").
function formatForeign(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

export function TripsSection({ period }: { period: Period }) {
  const { data: txns } = usePeriodTransactions(period.from, period.to);
  useChartTheme(); // subscribe so it recolors on theme flip (values are HTML here)

  const trips = useMemo(() => tripSpend(txns ?? []), [txns]);

  if (trips.length === 0) {
    return (
      <ChartCard title="Trips & foreign spend" subtitle="Per trip and currency">
        <EmptyChart message="Log a foreign-currency expense (or use Trip mode) to see per-trip spend." />
      </ChartCard>
    );
  }

  return (
    <>
      {trips.map((trip) => (
        <ChartCard key={trip.tag} title={trip.tag} subtitle={`${formatMoney(trip.totalInr)} total`}>
          <div className="space-y-2">
            {Array.from(trip.byCurrency.entries())
              .sort((a, b) => b[1].inr - a[1].inr)
              .map(([currency, amounts]) => (
                <div key={currency} className="flex items-center justify-between rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <div>
                    <p className="font-semibold">{currency}</p>
                    <p className="money text-xs text-text-muted">{formatForeign(amounts.original, currency)}</p>
                  </div>
                  <p className="money font-bold">{formatMoney(amounts.inr)}</p>
                </div>
              ))}
          </div>
        </ChartCard>
      ))}
    </>
  );
}
