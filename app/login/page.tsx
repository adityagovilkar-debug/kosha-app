"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { toast } from "sonner";
import { Mail, KeyRound, CheckCircle2 } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { errMessage } from "@/lib/errors";

type Method = "password" | "magic";

// Kosha shares its Supabase auth with Nudge (KOSHA-PLAN.md §2.1) — this is
// the same login flow, just reskinned to the Aurora Ledger look. An
// existing Nudge account signs in here with the same email/password.
export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("password");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  function redirectURL() {
    return `${window.location.origin}/auth/callback`;
  }

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const sb = supabaseBrowser();
    try {
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectURL() },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Almost there! Check your email to confirm your account.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function onMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const sb = supabaseBrowser();
    try {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectURL() },
      });
      if (error) throw error;
      setLinkSent(true);
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-lg brand-gradient">
            K
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{APP_NAME}</h1>
          <p className="mt-2 text-base text-text-muted">{APP_TAGLINE}</p>
        </div>

        {linkSent ? (
          <div className="card p-6 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-400" />
            <h2 className="text-xl font-semibold">Check your email</h2>
            <p className="mt-2 text-base text-text-muted">
              We sent a sign-in link to <b className="text-text">{email}</b>. Open it
              on this device to sign in.
            </p>
            <button
              className="btn-ghost mt-5 w-full"
              onClick={() => {
                setLinkSent(false);
                setMethod("password");
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <div className="card p-6">
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
              <button
                onClick={() => setMethod("password")}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
                  method === "password" ? "bg-surface text-text shadow-sm" : "text-text-muted"
                }`}
              >
                <KeyRound className="h-4 w-4" /> Password
              </button>
              <button
                onClick={() => setMethod("magic")}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
                  method === "magic" ? "bg-surface text-text shadow-sm" : "text-text-muted"
                }`}
              >
                <Mail className="h-4 w-4" /> Email link
              </button>
            </div>

            {method === "password" ? (
              <form onSubmit={onPassword} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    className="input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input
                    className="input"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                </div>
                <button className="btn-primary w-full" disabled={loading}>
                  {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
                </button>
                <p className="text-center text-base text-text-muted">
                  {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
                  <button
                    type="button"
                    className="font-semibold text-brand-400 hover:underline"
                    onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                  >
                    {mode === "signin" ? "Create an account" : "Sign in"}
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={onMagicLink} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    className="input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                <button className="btn-primary w-full" disabled={loading}>
                  {loading ? "Sending…" : "Email me a sign-in link"}
                </button>
                <p className="text-center text-base text-text-muted">
                  We&apos;ll email you a link that signs you in — no password to remember.
                </p>
              </form>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-sm text-text-muted">
          Your ledger is private to you. Only you can ever see it.
        </p>
      </div>
    </div>
  );
}
