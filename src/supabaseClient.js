import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Staff log in with a username, but Supabase Auth needs an email.
// This must match the pattern used in the create-staff Edge Function.
export function usernameToEmail(username) {
  return `${username.trim()}@palani.local`;
}
