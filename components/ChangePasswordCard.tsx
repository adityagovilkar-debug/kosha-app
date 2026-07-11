"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, LogOut } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { errMessage } from "@/lib/errors";

// Change password + sign out. Supabase's updateUser() only needs a live
// session, so the current password is verified explicitly first — a phone
// left unlocked shouldn't be enough to silently take over the account.
export function ChangePasswordCard() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) return toast.error("New password must be at least 8 characters");
    if (next !== confirm) return toast.error("New passwords don't match");
    if (next === current) return toast.error("New password is the same as the current one");
    setBusy(true);
    try {
      const sb = supabaseBrowser();
      const {
        data: { session },
      } = await sb.auth.getSession();
      const email = session?.user?.email;
      if (!email) throw new Error("Not signed in");

      // Verify the current password before changing anything.
      const { error: verifyError } = await sb.auth.signInWithPassword({ email, password: current });
      if (verifyError) {
        toast.error("Current password is incorrect");
        return;
      }

      const { error } = await sb.auth.updateUser({ password: next });
      if (error) throw error;

      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed");
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      await supabaseBrowser().auth.signOut();
      router.replace("/login");
      router.refresh();
    } catch (err) {
      toast.error(errMessage(err));
      setSigningOut(false);
    }
  }

  return (
    <div className="card mb-6 p-5">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-brand-400" />
        <h2 className="text-lg font-bold">Account</h2>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="label">Current password</label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">New password</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Confirm new</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-text-muted">
          At least 8 characters. This account also signs you into Nudge — the new password applies there too.
        </p>
        <button className="btn-primary w-full" disabled={busy || !current || !next || !confirm}>
          {busy ? "Changing…" : "Change password"}
        </button>
      </form>

      <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <button className="btn-outline w-full" onClick={onSignOut} disabled={signingOut}>
          <LogOut className="h-4 w-4" /> {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
