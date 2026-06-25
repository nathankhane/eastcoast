import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Supabase clients.
//   - browserSupabase(): anon key, safe in the browser, subject to RLS.
//   - adminSupabase():   service-role key, SERVER ONLY, bypasses RLS.
//
// Both are created lazily so the app still runs (in localStorage-only mode)
// when env vars are absent.
// ============================================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function supabaseConfigured(): boolean {
  return !!url && !!anonKey;
}

let _browser: SupabaseClient | null = null;

export function browserSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (_browser) return _browser;
  _browser = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return _browser;
}

let _admin: SupabaseClient | null = null;

// SERVER ONLY. Throws if called without the service-role key configured.
export function adminSupabase(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("adminSupabase() must only be called on the server");
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase server env vars missing (URL / SERVICE_ROLE_KEY)");
  }
  if (_admin) return _admin;
  _admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
