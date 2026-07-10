"use client";

interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function ChartCard({ title, subtitle, children, action }: Props) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{title}</h3>
          {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border text-center text-sm text-text-muted" style={{ borderColor: "var(--border)" }}>
      {message}
    </div>
  );
}
