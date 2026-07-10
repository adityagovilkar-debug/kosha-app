"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Delete, LockKeyhole } from "lucide-react";
import { isLocked, verifyPin, markUnlocked, relock, onLockChange, IDLE_LOCK_MS } from "@/lib/kosha/appLock";
import { APP_NAME } from "@/lib/brand";

// Renders children, and overlays a PIN lock screen whenever a PIN is set and
// the session isn't unlocked. An idle timer re-locks after 15 minutes.
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [locked, setLocked] = useState(false);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Never lock the auth pages (you'd be trapped before signing in).
  const onAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/auth");

  useEffect(() => {
    const run = () => setLocked(isLocked() && !onAuthPage);
    run();
    return onLockChange(run);
  }, [onAuthPage]);

  // Idle auto-lock: reset on activity; fire relock() after IDLE_LOCK_MS.
  useEffect(() => {
    if (onAuthPage) return;
    const reset = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => relock(), IDLE_LOCK_MS);
    };
    const events = ["pointerdown", "keydown", "visibilitychange"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [onAuthPage]);

  async function submit(pin: string) {
    if (await verifyPin(pin)) {
      markUnlocked();
      setEntry("");
      setError(false);
    } else {
      setError(true);
      setEntry("");
      setTimeout(() => setError(false), 600);
    }
  }

  function press(k: string) {
    if (k === "⌫") {
      setEntry((e) => e.slice(0, -1));
      return;
    }
    setEntry((e) => {
      const next = (e + k).slice(0, 8);
      if (next.length >= 4 && next.length === e.length + 1) {
        // Try to unlock once we have at least 4 digits, on each keypress.
        void submit(next);
      }
      return next;
    });
  }

  return (
    <>
      {children}
      {locked && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg p-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-white brand-gradient">
            <LockKeyhole className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-bold">{APP_NAME} is locked</h1>
          <p className="mt-1 text-sm text-text-muted">Enter your PIN</p>

          <div className={`mt-6 flex gap-3 ${error ? "animate-pulse" : ""}`}>
            {Array.from({ length: Math.max(4, entry.length) }).map((_, i) => (
              <span
                key={i}
                className="h-3.5 w-3.5 rounded-full border"
                style={{
                  borderColor: error ? "var(--money-expense)" : "var(--border)",
                  backgroundColor: i < entry.length ? (error ? "var(--money-expense)" : "var(--ring)") : "transparent",
                }}
              />
            ))}
          </div>

          <div className="mt-8 grid w-full max-w-[240px] grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
              k === "" ? (
                <span key={i} />
              ) : (
                <button key={i} type="button" onClick={() => press(k)} className="btn-outline !min-h-[56px] text-xl font-semibold">
                  {k === "⌫" ? <Delete className="mx-auto h-5 w-5" /> : k}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </>
  );
}
