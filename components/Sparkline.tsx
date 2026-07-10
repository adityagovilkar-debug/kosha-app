"use client";

interface Props {
  points: number[];
  className?: string;
  width?: number;
  height?: number;
  color?: string;
}

// Tiny inline trend line for account rows / stat tiles (KOSHA-PLAN.md §7.3
// micro-viz). Pure SVG, no chart library, no axes — just the shape.
export function Sparkline({ points, className, width = 72, height = 24, color = "currentColor" }: Props) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(height - ((p - min) / range) * height).toFixed(1)}`)
    .join(" ");
  return (
    <svg className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      <path d={d} stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
    </svg>
  );
}
