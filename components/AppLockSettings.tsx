"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock, CheckCircle2 } from "lucide-react";
import { hasPin, setPin, clearPin } from "@/lib/kosha/appLock";

export function AppLockSettings() {
  const [enabled, setEnabled] = useState(false);
  const [pin, setPinInput] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => setEnabled(hasPin());
    refresh();
  }, []);

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(pin)) return toast.error("PIN must be 4–8 digits");
    if (pin !== confirm) return toast.error("PINs don't match");
    setBusy(true);
    try {
      await setPin(pin);
      setEnabled(true);
      setPinInput("");
      setConfirm("");
      toast.success("App lock is on");
    } finally {
      setBusy(false);
    }
  }

  function disable() {
    clearPin();
    setEnabled(false);
    toast.success("App lock is off");
  }

  return (
    <div className="card mb-6 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Lock className="h-5 w-5 text-brand-400" />
        <h2 className="text-lg font-bold">App lock</h2>
      </div>
      <p className="mb-4 text-sm text-text-muted">
        Require a PIN to open Kosha, with an automatic lock after 15 minutes idle. The PIN is stored only as a
        hash on this device — it&apos;s a convenience gate on top of your sign-in, not a password reset.
      </p>

      {enabled ? (
        <div className="flex items-center justify-between rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-income" /> PIN lock is on
          </p>
          <button className="btn-ghost !min-h-0 !py-1.5 !px-3 text-sm" onClick={disable}>
            Turn off
          </button>
        </div>
      ) : (
        <form onSubmit={enable} className="grid grid-cols-2 gap-3">
          <input
            className="input money"
            type="password"
            inputMode="numeric"
            placeholder="New PIN"
            value={pin}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
            maxLength={8}
          />
          <input
            className="input money"
            type="password"
            inputMode="numeric"
            placeholder="Confirm PIN"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
            maxLength={8}
          />
          <button className="btn-primary col-span-2" disabled={busy}>
            {busy ? "Saving…" : "Turn on app lock"}
          </button>
        </form>
      )}
    </div>
  );
}
