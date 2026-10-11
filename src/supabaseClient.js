import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) before starting Palani.");
}
if (supabaseKey.startsWith("sb_secret_")) {
  throw new Error("A Supabase secret key cannot be used in the browser. Use a publishable key.");
}
try {
  const payload = supabaseKey.split(".")[1];
  if (payload && JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role") {
    throw new Error("A Supabase service-role key cannot be used in the browser.");
  }
} catch (error) {
  if (error.message.includes("service-role")) throw error;
}
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

// Staff log in with a username, but Supabase Auth needs an email.
// This must match the pattern used in the create-staff Edge Function.
export function usernameToEmail(username) {
  return `${username.trim()}@palani.local`;
}
