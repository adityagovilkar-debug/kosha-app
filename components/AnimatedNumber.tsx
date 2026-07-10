"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";

interface Props {
  value: number; // minor units
  currency?: string;
  className?: string;
  durationMs?: number;
}

// Count-up animation for hero money figures (KOSHA-PLAN.md §10 — "numbers
// count up on load"). Respects prefers-reduced-motion (snaps to the value).
export function AnimatedMoney({ value, currency = "INR", className, durationMs = 650 }: Props) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return <span className={className}>{formatMoney(display, currency)}</span>;
}
