// Public build-time settings (see .env). NEXT_PUBLIC_* values are inlined at build time,
// so they must be read with the full literal name.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Path to a file in /public, including the base path the site is served under. */
export const asset = (path: string) => `${BASE_PATH}${path}`;
