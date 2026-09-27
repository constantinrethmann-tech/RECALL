"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useAuth } from "@/components/auth";
import { Button, ErrorNote, Wordmark } from "@/components/ui";
import { isConfigured } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";

const EMAIL_KEY = "recall-last-email";

function readSavedEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}
const noSubscription = () => () => {};

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Wrong email or password.";
  if (/email not confirmed/i.test(message)) return "This account isn't confirmed yet. In Supabase → Authentication → Users, create it with “Auto Confirm User” ticked.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Wait a minute and try again.";
  if (/fetch|network/i.test(message)) return "No connection to the server. Check your internet and try again.";
  return message;
}

/** Sign-in with email + password (your password manager can fill both in). */
export default function LoginPage() {
  const router = useRouter();
  const { session, ready } = useAuth();
  const savedEmail = useSyncExternalStore(noSubscription, readSavedEmail, () => "");
  const [typedEmail, setEmail] = useState<string | null>(null);
  const email = typedEmail ?? savedEmail;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) router.replace("/");
  }, [ready, session, router]);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!isConfigured) return setError("RECALL isn't connected to Supabase yet (see .env).");
    setBusy(true);
    setError(null);
    const address = email.trim().toLowerCase();
    const { error } = await getSupabase().auth.signInWithPassword({ email: address, password });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    try {
      localStorage.setItem(EMAIL_KEY, address);
    } catch {}
    router.replace("/");
  }

  const input =
    "h-14 w-full border-0 border-b border-seam-3 bg-transparent px-0 text-lg text-frost outline-none transition-colors placeholder:text-seam-3 focus:border-ion";

  return (
    <main className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Wordmark size="lg" />
        <p className="eyebrow mt-3">Spaced repetition, tailored</p>

        <form onSubmit={signIn} className="mt-14 space-y-8">
          <label className="block">
            <span className="eyebrow">Email</span>
            <input
              type="email"
              name="email"
              inputMode="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={input}
            />
          </label>
          <label className="block">
            <span className="eyebrow">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </label>
          <Button type="submit" disabled={busy || !email.includes("@") || !password} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {error && (
          <div className="mt-8">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </div>
    </main>
  );
}
