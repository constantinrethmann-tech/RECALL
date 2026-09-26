"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ButtonLink, ErrorNote, Splash } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";

/** Target of the "Sign in with one tap" link in the sign-in email. */
export default function ConfirmPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const code = params.get("code");
    const sb = getSupabase();
    const attempt = tokenHash
      ? sb.auth.verifyOtp({ token_hash: tokenHash, type: (params.get("type") ?? "email") as EmailOtpType })
      : code
        ? sb.auth.exchangeCodeForSession(code)
        : Promise.resolve({ error: { message: "This sign-in link is incomplete." } });
    attempt.then(({ error }) => {
      if (error) setError(`${error.message}. Links work once and expire after an hour; you can also type the code from the email.`);
      else router.replace("/");
    });
  }, [router]);

  if (!error) return <Splash label="Signing in" />;
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <ErrorNote>{error}</ErrorNote>
        <ButtonLink href="/login/" variant="ghost" className="w-full">
          Back to sign in
        </ButtonLink>
      </div>
    </main>
  );
}
