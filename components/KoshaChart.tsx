"use client";

import { useEffect, useRef } from "react";
import { echarts, type EChartsOption } from "@/lib/echarts";

interface Props {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  /** Re-init when this changes (e.g. chart type toggles that swap series kinds). */
  resetKey?: string | number;
  ariaLabel?: string;
}

// Thin React wrapper around an ECharts instance: init once, update option
// on change, resize with the container, dispose on unmount, and re-apply
// when the app's light/dark theme flips (observed off the <html> class).
export function KoshaChart({ option, height = 320, className, resetKey, ariaLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  // The option object last handed to ECharts, so the update effect can skip
  // the one the init effect already applied (with the reduced-motion flag).
  const appliedRef = useRef<EChartsOption | null>(null);

  // (Re)create the instance when resetKey changes.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(containerRef.current);

    // Reduced-motion: disable entry animation.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    chart.setOption({ animation: !reduce, animationDuration: 450, animationEasing: "cubicOut", ...option } as EChartsOption);
    appliedRef.current = option;

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
      appliedRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Update on data/theme change — but skip the option the init effect just
  // applied (same reference), so the motion flag isn't clobbered on mount.
  useEffect(() => {
    if (!chartRef.current || appliedRef.current === option) return;
    chartRef.current.setOption(option, { notMerge: true });
    appliedRef.current = option;
  }, [option]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height }} role="img" aria-label={ariaLabel} />;
}
