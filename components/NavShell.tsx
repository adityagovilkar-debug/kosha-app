"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Receipt, CalendarClock, Wallet, Tags, Plus, Settings } from "lucide-react";
import { useQuickAdd } from "./QuickAddProvider";
import { APP_NAME } from "@/lib/brand";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/plan", label: "Plan", icon: CalendarClock },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/categories", label: "Categories", icon: Tags },
];

// Bottom tab bar on mobile, sidebar on desktop (KOSHA-PLAN.md §4). A center
// FAB opens the Quick-Add sheet from anywhere in the app.
export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { open } = useQuickAdd();

  // Auth pages get no chrome.
  if (pathname?.startsWith("/login") || pathname?.startsWith("/auth")) {
    return <>{children}</>;
  }

  return (
    <div className="md:flex md:min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:p-4" style={{ borderColor: "var(--border)" }}>
        <div className="mb-8 flex items-center gap-2 px-2 pt-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold text-white brand-gradient">K</div>
          <span className="text-lg font-bold tracking-tight">{APP_NAME}</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  active ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
          <Link
            href="/settings"
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              pathname?.startsWith("/settings") ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface-2 hover:text-text"
            }`}
          >
            <Settings className="h-5 w-5" />
            Settings
          </Link>
        </nav>
        <button className="btn-primary mt-4 w-full" onClick={() => open()}>
          <Plus className="h-5 w-5" /> Add transaction
        </button>
      </aside>

      {/* Mobile settings shortcut */}
      <Link
        href="/settings"
        className="glass fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full md:hidden"
        aria-label="Settings"
      >
        <Settings className="h-5 w-5 text-text-muted" />
      </Link>

      {/* Main content */}
      <main className="flex-1 pb-24 md:pb-0">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav
        className="glass fixed inset-x-0 bottom-0 z-40 flex items-center justify-around rounded-t-3xl px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
        style={{ borderBottomWidth: 0 }}
      >
        {NAV_ITEMS.slice(0, 2).map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-xs font-medium ${
                active ? "text-brand-400" : "text-text-muted"
              }`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </Link>
          );
        })}

        <button
          onClick={() => open()}
          className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg brand-gradient active:scale-95"
          aria-label="Add transaction"
        >
          <Plus className="h-7 w-7" />
        </button>

        {NAV_ITEMS.slice(2).map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-xs font-medium ${
                active ? "text-brand-400" : "text-text-muted"
              }`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
