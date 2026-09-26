import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, isConfigured } from "./env";

let client: SupabaseClient | null = null;

/** The one Supabase client for the whole app (browser only). */
export function getSupabase(): SupabaseClient {
  if (!isConfigured) throw new Error("Supabase is not configured (see .env).");
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Sign-in links are handled explicitly on /auth/confirm.
      detectSessionInUrl: false,
      flowType: "pkce",
      storageKey: "recall-auth",
    },
  });
  return client;
}

export async function currentUserId(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("You are signed out. Sign in again.");
  return id;
}
