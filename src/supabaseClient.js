import { createClient } from "@supabase/supabase-js";

// Vite exposes env vars prefixed with VITE_ to the browser bundle.
// These MUST be the publishable key + project URL — never the secret key.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Check your .env file (local) or Vercel environment variables (deployed)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
