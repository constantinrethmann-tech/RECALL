"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useAuth } from "@/components/auth";
import { Button, ErrorNote, Wordmark } from "@/components/ui";
import { BASE_PATH, isConfigured } from "@/lib/env";
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
  if (/rate limit|too many|security purposes/i.test(message))
    return "Too many emails in a short time. Wait a minute, then try again (Supabase's free email sender only allows a few per hour).";
  if (/signups? not allowed|not allowed for otp/i.test(message)) return "This email isn't registered for RECALL.";
  if (/expired|invalid/i.test(message)) return "That code is wrong or has expired. Check the latest email, or request a new code.";
  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const { session, ready } = useAuth();
  const savedEmail = useSyncExternalStore(noSubscription, readSavedEmail, () => "");
  const [typedEmail, setEmail] = useState<string | null>(null);
  const email = typedEmail ?? savedEmail;
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) router.replace("/");
  }, [ready, session, router]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (!isConfigured) return setError("RECALL isn't connected to Supabase yet (see .env).");
    setBusy(true);
    setError(null);
    const address = email.trim().toLowerCase();
    const { error } = await getSupabase().auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}${BASE_PATH}/auth/confirm/` },
    });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    try {
      localStorage.setItem(EMAIL_KEY, address);
    } catch {}
    setStep("code");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    router.replace("/");
  }

  const input =
    "h-14 w-full border-0 border-b border-seam-3 bg-transparent px-0 text-lg text-frost outline-none transition-colors placeholder:text-seam-3 focus:border-ion";

  return (
    <main className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Wordmark size="lg" />
        <p className="eyebrow mt-3">Spaced repetition, tailored</p>

        {step === "email" ? (
          <form onSubmit={sendCode} className="mt-14 space-y-8">
            <label className="block">
              <span className="eyebrow">Email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={input}
              />
            </label>
            <Button type="submit" disabled={busy || !email.includes("@")} className="w-full">
              {busy ? "Sending…" : "Email me a sign-in code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-14 space-y-8">
            <p className="text-[15px] text-mist">
              We sent a code to <span className="text-frost">{email}</span>. Type it here.
            </p>
            <label className="block">
              <span className="eyebrow">Code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={10}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className={`${input} font-mono tracking-[0.4em]`}
              />
            </label>
            <Button type="submit" disabled={busy || code.length < 6} className="w-full">
              {busy ? "Checking…" : "Sign in"}
            </Button>
            <div className="flex justify-between">
              <button type="button" onClick={() => setStep("email")} className="h-10 text-[13px] text-mist hover:text-frost">
                Different email
              </button>
              <button type="button" onClick={() => sendCode()} disabled={busy} className="h-10 text-[13px] text-mist hover:text-frost">
                Send a new code
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className="mt-8">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </div>
    </main>
  );
}
