"use client";

import { useMemo, useState } from "react";
import { PeriodSwitcher } from "@/components/PeriodSwitcher";
import { resolvePeriod, type PeriodKey } from "@/lib/kosha/period";
import { SpendingSection } from "@/components/insights/SpendingSection";
import { WealthSection } from "@/components/insights/WealthSection";
import { PlanSection } from "@/components/insights/PlanSection";
import { IncomeTaxSection } from "@/components/insights/IncomeTaxSection";
import { TripsSection } from "@/components/insights/TripsSection";
import { ReviewSection } from "@/components/insights/ReviewSection";

type SectionKey = "spending" | "wealth" | "plan" | "income" | "trips" | "review";

const SECTIONS: { key: SectionKey; label: string; periodScoped: boolean }[] = [
  { key: "spending", label: "Spending", periodScoped: true },
  { key: "wealth", label: "Wealth", periodScoped: false },
  { key: "plan", label: "Plan", periodScoped: false },
  { key: "income", label: "Income & tax", periodScoped: true },
  { key: "trips", label: "Trips", periodScoped: true },
  { key: "review", label: "Review", periodScoped: false },
];

export default function InsightsPage() {
  const [section, setSection] = useState<SectionKey>("spending");
  const [periodKey, setPeriodKey] = useState<PeriodKey>("6m");
  const period = useMemo(() => resolvePeriod(periodKey), [periodKey]);

  const activeSection = SECTIONS.find((s) => s.key === section)!;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Insights</h1>

      {/* Section tabs */}
      <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto pb-1">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              section === s.key ? "text-white brand-gradient" : "bg-surface-2 text-text-muted hover:text-text"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Period switcher (only for period-scoped sections) */}
      {activeSection.periodScoped && (
        <div className="mb-4">
          <PeriodSwitcher value={periodKey} onChange={setPeriodKey} />
          <p className="mt-1.5 px-1 text-xs text-text-muted">
            {period.label} · all values in ₹; foreign converted at transaction-date rates
          </p>
        </div>
      )}

      <div className="space-y-4">
        {section === "spending" && <SpendingSection period={period} />}
        {section === "wealth" && <WealthSection />}
        {section === "plan" && <PlanSection />}
        {section === "income" && <IncomeTaxSection period={period} />}
        {section === "trips" && <TripsSection period={period} />}
        {section === "review" && <ReviewSection />}
      </div>
    </div>
  );
}
