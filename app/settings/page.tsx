"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Plane, CheckCircle2, Sun, Moon } from "lucide-react";
import { useApiKeyStatus, useSaveApiKey, useClearApiKey, useTripMode, setTripMode } from "@/lib/kosha/settings";
import { useTheme } from "@/lib/theme";
import { AppLockSettings } from "@/components/AppLockSettings";
import { BackupSettings } from "@/components/BackupSettings";

export default function SettingsPage() {
  const { data: keyStatus } = useApiKeyStatus();
  const saveKey = useSaveApiKey();
  const clearKey = useClearApiKey();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [theme, setTheme] = useTheme();

  const trip = useTripMode();
  const [tripEnabled, setTripEnabled] = useState(trip?.enabled ?? false);
  const [tripCurrency, setTripCurrency] = useState(trip?.currency ?? "EUR");
  const [tripTag, setTripTag] = useState(trip?.tag ?? "");

  async function onSaveKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKeyInput.trim()) return toast.error("Paste your Anthropic API key first");
    try {
      await saveKey.mutateAsync(apiKeyInput.trim());
      setApiKeyInput("");
      toast.success("API key saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function onClearKey() {
    await clearKey.mutateAsync();
    toast.success("API key removed");
  }

  function onSaveTrip(e: React.FormEvent) {
    e.preventDefault();
    if (tripEnabled) {
      if (!tripCurrency.trim() || !tripTag.trim()) return toast.error("Enter a currency and a trip name");
      setTripMode({ enabled: true, currency: tripCurrency.trim().toUpperCase(), tag: tripTag.trim() });
      toast.success("Trip mode is on");
    } else {
      setTripMode(null);
      toast.success("Trip mode is off");
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Settings</h1>

      {/* Appearance */}
      <div className="card mb-6 p-5">
        <h2 className="mb-3 text-lg font-bold">Appearance</h2>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1">
          <button
            onClick={() => setTheme("dark")}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${theme === "dark" ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}
          >
            <Moon className="h-4 w-4" /> Dark
          </button>
          <button
            onClick={() => setTheme("light")}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${theme === "light" ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}
          >
            <Sun className="h-4 w-4" /> Light
          </button>
        </div>
      </div>

      {/* App lock */}
      <AppLockSettings />

      {/* Backup & restore */}
      <BackupSettings />

      {/* Receipt scanning */}
      <div className="card mb-6 p-5">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand-400" />
          <h2 className="text-lg font-bold">Receipt scanning</h2>
        </div>
        <p className="mb-4 text-sm text-text-muted">
          Paste your own Anthropic API key to scan receipts with Claude — it&apos;s encrypted before it&apos;s
          stored and never sent back to your browser. Get a key at{" "}
          <span className="text-text">console.anthropic.com</span>. Without a key, the camera still works, but
          you&apos;ll fill in the details by hand.
        </p>

        {keyStatus?.hasKey ? (
          <div className="flex items-center justify-between rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-income" /> API key is set
            </p>
            <button className="btn-ghost !min-h-0 !py-1.5 !px-3 text-sm" onClick={onClearKey} disabled={clearKey.isPending}>
              Remove
            </button>
          </div>
        ) : (
          <form onSubmit={onSaveKey} className="flex gap-2">
            <input
              className="input flex-1"
              type="password"
              placeholder="sk-ant-…"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <button className="btn-primary shrink-0" disabled={saveKey.isPending}>
              {saveKey.isPending ? "Saving…" : "Save"}
            </button>
          </form>
        )}
      </div>

      {/* Trip mode */}
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Plane className="h-5 w-5 text-brand-400" />
          <h2 className="text-lg font-bold">Trip mode</h2>
        </div>
        <p className="mb-4 text-sm text-text-muted">
          While traveling, Quick-Add can default to a foreign currency and tag every expense with your trip name —
          useful for a per-trip spend report later.
        </p>
        <form onSubmit={onSaveTrip} className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={tripEnabled} onChange={(e) => setTripEnabled(e.target.checked)} className="h-4 w-4" />
            Trip mode is on
          </label>
          {tripEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Currency</label>
                <input className="input" value={tripCurrency} onChange={(e) => setTripCurrency(e.target.value)} maxLength={3} />
              </div>
              <div>
                <label className="label">Trip name</label>
                <input className="input" placeholder="e.g. Germany Aug 2026" value={tripTag} onChange={(e) => setTripTag(e.target.value)} />
              </div>
            </div>
          )}
          <button className="btn-primary w-full">Save</button>
        </form>
      </div>
    </div>
  );
}
