"use client";

import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isConfigured } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";
import { Splash, Wordmark } from "./ui";

interface AuthState {
  session: Session | null;
  ready: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, ready: !isConfigured });

  useEffect(() => {
    if (!isConfigured) return;
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => setState({ session: data.session, ready: true }));
    const { data } = sb.auth.onAuthStateChange((_event, session) => setState({ session, ready: true }));
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Shows its children only when signed in; otherwise goes to the login screen. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isConfigured && ready && !session) router.replace("/login/");
  }, [ready, session, router]);

  if (!isConfigured) return <SetupNeeded />;
  if (!ready || !session) return <Splash />;
  return <>{children}</>;
}

function SetupNeeded() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-sm space-y-4 text-center">
        <Wordmark size="lg" />
        <p className="text-mist">
          Almost there: this copy of RECALL isn&apos;t connected to Supabase yet. Add the Project URL and publishable key to the <code className="font-mono text-frost">.env</code> file.
        </p>
      </div>
    </main>
  );
}

export async function signOut() {
  await getSupabase().auth.signOut();
}
