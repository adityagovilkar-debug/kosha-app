"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Receipt, CalendarClock, LineChart, Wallet, Tags, Plus, Settings, MoreHorizontal } from "lucide-react";
import { useQuickAdd } from "./QuickAddProvider";
import { APP_NAME } from "@/lib/brand";

// Primary destinations live in the mobile bottom bar (2 left of the FAB, 2
// right). Secondary/management screens live behind the mobile "More" menu
// and below a divider in the desktop sidebar.
const PRIMARY_NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/plan", label: "Plan", icon: CalendarClock },
  { href: "/wealth", label: "Wealth", icon: LineChart },
];

const SECONDARY_NAV = [
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { open } = useQuickAdd();
  const [moreOpen, setMoreOpen] = useState(false);

  // Auth pages get no chrome.
  if (pathname?.startsWith("/login") || pathname?.startsWith("/auth")) {
    return <>{children}</>;
  }

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname?.startsWith(href));

  return (
    <div className="md:flex md:min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:p-4" style={{ borderColor: "var(--border)" }}>
        <div className="mb-8 flex items-center gap-2 px-2 pt-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold text-white brand-gradient">K</div>
          <span className="text-lg font-bold tracking-tight">{APP_NAME}</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {PRIMARY_NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                isActive(href) ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
          <div className="my-2 border-t" style={{ borderColor: "var(--border)" }} />
          {SECONDARY_NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                isActive(href) ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </nav>
        <button className="btn-primary mt-4 w-full" onClick={() => open()}>
          <Plus className="h-5 w-5" /> Add transaction
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 pb-24 md:pb-0">{children}</main>

      {/* Mobile "More" menu */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="glass w-full rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            {SECONDARY_NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-base font-semibold text-text hover:bg-surface-2"
              >
                <Icon className="h-5 w-5 text-text-muted" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Mobile bottom tab bar: Home, Transactions, [FAB], Plan, Wealth, More */}
      <nav
        className="glass fixed inset-x-0 bottom-0 z-40 flex items-center justify-around rounded-t-3xl px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
        style={{ borderBottomWidth: 0 }}
      >
        {PRIMARY_NAV.slice(0, 2).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-xs font-medium ${
              isActive(href) ? "text-brand-400" : "text-text-muted"
            }`}
          >
            <Icon className="h-6 w-6" />
            {label}
          </Link>
        ))}

        <button
          onClick={() => open()}
          className="-mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-lg brand-gradient active:scale-95"
          aria-label="Add transaction"
        >
          <Plus className="h-7 w-7" />
        </button>

        {PRIMARY_NAV.slice(2).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-xs font-medium ${
              isActive(href) ? "text-brand-400" : "text-text-muted"
            }`}
          >
            <Icon className="h-6 w-6" />
            {label}
          </Link>
        ))}

        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-xs font-medium text-text-muted"
        >
          <MoreHorizontal className="h-6 w-6" />
          More
        </button>
      </nav>
    </div>
  );
}
