"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, ShieldCheck } from "lucide-react";
import { daysSinceBackup } from "@/lib/kosha/backup";

const DISMISS_KEY = "kosha-backup-nudge-dismissed";

// Gentle reminder to export a backup if it's been over a month (or never).
// Dismissible for the session so it never nags mid-task.
export function BackupNudge() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const compute = () => {
      if (sessionStorage.getItem(DISMISS_KEY)) return setShow(false);
      const days = daysSinceBackup();
      setShow(days === null || days > 30);
    };
    compute();
  }, []);

  if (!show) return null;

  return (
    <div className="card mb-4 flex items-center gap-3 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-400">
        <ShieldCheck className="h-5 w-5" />
      </div>
      <div className="flex-1 text-sm">
        <p className="font-semibold">Time to back up</p>
        <p className="text-text-muted">
          Keep a copy of your data safe.{" "}
          <Link href="/settings" className="font-semibold text-brand-400">
            Export now
          </Link>
        </p>
      </div>
      <button
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setShow(false);
        }}
        className="btn-ghost !min-h-0 shrink-0 !p-1.5"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
