import { createBrowserClient } from "@supabase/ssr";
import { assertSupabaseConfig, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

export function supabaseBrowser() {
  assertSupabaseConfig();
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
